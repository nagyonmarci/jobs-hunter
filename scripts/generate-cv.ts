import fs from "node:fs/promises";
import path from "node:path";
import puppeteer from "puppeteer";
import { mdToPdf } from "md-to-pdf";
import { getJobLead, updateJobLead, getAppSettings, getBaseCv } from "./db.js";
import type { AppSettingsRow } from "./db.js";

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

async function callLLM(prompt: string, settings: AppSettingsRow): Promise<string> {
  const provider = settings.preferred_llm || "openai";

  if (provider === "openai") {
    const { OpenAI } = await import("openai");
    const openai = new OpenAI({ apiKey: settings.openai_api_key ?? undefined });
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: prompt }]
    });
    return response.choices[0]?.message.content ?? "";
  } else if (provider === "anthropic") {
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    const anthropic = new Anthropic({ apiKey: settings.anthropic_api_key ?? undefined });
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
    const ai = new GoogleGenAI({ apiKey: settings.gemini_api_key ?? undefined });
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
  filename: string | null;
}> {
  const id = Number(jobId);
  const job = await getJobLead(id);
  if (!job) throw new Error("Job not found");

  const settings = await getAppSettings();
  if (!settings) throw new Error("App settings not configured");

  let description = job.description;

  if (!description) {
    if (!settings.openai_api_key) {
      throw new Error(
        "OpenAI API Key is required for image text extraction (markitdown uses OpenAI Vision)."
      );
    }
    const screenshotPath = path.resolve(`data/screenshot-${id}.png`);
    await takeScreenshot(job.url, screenshotPath);
    description = await extractTextFromScreenshot(screenshotPath, settings.openai_api_key);

    await updateJobLead(id, { description });

    try {
      await fs.unlink(screenshotPath);
    } catch {
      /* swallow */
    }
  }

  const baseCv = await getBaseCv();
  if (!baseCv?.content) {
    throw new Error("Base CV not found. Please add your master CV in the admin Setup tab.");
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

  let filename: string | null = null;
  if (pdfResult) {
    filename = `cv-${id}.pdf`;
    const cvDir = path.resolve("data/cvs");
    await fs.mkdir(cvDir, { recursive: true });
    await fs.writeFile(path.join(cvDir, filename), pdfResult.content);
  }

  await updateJobLead(id, { generated_cv: generatedMarkdown, generated_cv_pdf: filename });

  return { success: true, markdown: generatedMarkdown, filename };
}
