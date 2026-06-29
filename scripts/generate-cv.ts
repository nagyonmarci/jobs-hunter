import fs from "node:fs/promises";
import path from "node:path";
import puppeteer from "puppeteer";
import { mdToPdf } from "md-to-pdf";
import { createDirectusClient } from "./directus-client.js";

interface AppSettings {
  preferred_llm?: string;
  openai_api_key?: string;
  anthropic_api_key?: string;
  gemini_api_key?: string;
}

interface JobLead {
  url: string;
  description?: string | null;
}

async function takeScreenshot(url: string, outputPath: string): Promise<void> {
  const browser = await puppeteer.launch({
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
    headless: true
  });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 1024 });
    await page.goto(url, { waitUntil: "networkidle2", timeout: 60000 });
    await new Promise((resolve) => setTimeout(resolve, 3000));
    await page.screenshot({ path: outputPath, fullPage: true });
  } finally {
    await browser.close();
  }
}

async function extractTextFromScreenshot(imagePath: string, apiKey: string): Promise<string> {
  const { OpenAI } = await import("openai");
  const openai = new OpenAI({ apiKey });
  const base64 = (await fs.readFile(imagePath)).toString("base64");
  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      {
        role: "user",
        content: [
          { type: "image_url", image_url: { url: `data:image/png;base64,${base64}` } },
          {
            type: "text",
            text: "Extract all visible text from this screenshot and return it as markdown."
          }
        ]
      }
    ]
  });
  return response.choices[0]?.message.content ?? "";
}

async function callLLM(prompt: string, settings: AppSettings): Promise<string> {
  const provider = settings.preferred_llm || "openai";

  if (provider === "openai") {
    const { OpenAI } = await import("openai");
    const openai = new OpenAI({ apiKey: settings.openai_api_key });
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: prompt }]
    });
    return response.choices[0]?.message.content ?? "";
  } else if (provider === "anthropic") {
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    const anthropic = new Anthropic({ apiKey: settings.anthropic_api_key });
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 4000,
      messages: [{ role: "user", content: prompt }]
    });
    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text")
      throw new Error("No text block in Anthropic response");
    return textBlock.text;
  } else if (provider === "gemini") {
    const { GoogleGenAI } = await import("@google/genai");
    const ai = new GoogleGenAI({ apiKey: settings.gemini_api_key });
    const result = await ai.models.generateContent({
      model: "gemini-2.5-pro",
      contents: prompt
    });
    return result.text ?? "";
  } else {
    throw new Error(`Unsupported LLM provider: ${provider}`);
  }
}

export async function processCvGeneration(jobId: string): Promise<{
  success: boolean;
  markdown: string;
  fileId: string | null;
}> {
  const directus = await createDirectusClient();

  const { data: job } = (await directus.request(`/items/job_leads/${jobId}`)) as {
    data: JobLead | null;
  };
  if (!job) throw new Error("Job not found");

  const { data: settings } = (await directus.request(`/items/app_settings`)) as {
    data: AppSettings | null;
  };
  if (!settings) throw new Error("App settings not configured");

  let description = job.description;

  if (!description) {
    if (!settings.openai_api_key) {
      throw new Error(
        "OpenAI API Key is required for image text extraction (markitdown uses OpenAI Vision)."
      );
    }
    const screenshotPath = path.resolve(`data/screenshot-${jobId}.png`);
    await takeScreenshot(job.url, screenshotPath);
    description = await extractTextFromScreenshot(screenshotPath, settings.openai_api_key);

    await directus.request(`/items/job_leads/${jobId}`, {
      method: "PATCH",
      body: JSON.stringify({ description })
    });

    try {
      await fs.unlink(screenshotPath);
    } catch {
      /* swallow */
    }
  }

  const { data: baseCv } = (await directus.request(`/items/base_cv`)) as {
    data: { content?: string } | null;
  };
  if (!baseCv?.content) {
    throw new Error("Base CV not found. Please add your master CV to the base_cv collection.");
  }

  const prompt = `You are an expert ATS-optimized CV writer.
I will provide you with a Master CV and a Job Description.
Please rewrite the Master CV to highlight the skills and experiences that are most relevant to the Job Description.
Do NOT invent or hallucinate any new experiences, skills, or facts that are not present in the Master CV.
Structure the output as a clean, professional Markdown document.

MASTER CV:
${baseCv.content}

JOB DESCRIPTION:
${description}
`;

  const generatedMarkdown = await callLLM(prompt, settings);

  const pdfResult = await mdToPdf({ content: generatedMarkdown }).catch(console.error);

  let fileId: string | null = null;
  if (pdfResult) {
    const formData = new FormData();
    const blob = new Blob([new Uint8Array(pdfResult.content)], { type: "application/pdf" });
    formData.append("file", blob, `cv-${jobId}.pdf`);

    const uploadRes = await fetch(`${process.env.DIRECTUS_URL}/files`, {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.DIRECTUS_TOKEN}` },
      body: formData
    });
    const uploadData = (await uploadRes.json()) as { data?: { id?: string } };
    fileId = uploadData.data?.id ?? null;
  }

  await directus.request(`/items/job_leads/${jobId}`, {
    method: "PATCH",
    body: JSON.stringify({ generated_cv: generatedMarkdown, generated_cv_pdf: fileId })
  });

  return { success: true, markdown: generatedMarkdown, fileId };
}
