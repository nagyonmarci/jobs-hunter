import fs from "node:fs/promises";
import path from "node:path";
import puppeteer from "puppeteer";
import { mdToPdf } from "md-to-pdf";
import { createDirectusClient } from "./directus-client.mjs";

const directus = await createDirectusClient();

async function takeScreenshot(url, outputPath) {
  const browser = await puppeteer.launch({
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
    headless: "new"
  });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 1024 });
    await page.goto(url, { waitUntil: "networkidle2", timeout: 60000 });
    // wait a bit for dynamic content
    await new Promise(resolve => setTimeout(resolve, 3000));
    await page.screenshot({ path: outputPath, fullPage: true });
  } finally {
    await browser.close();
  }
}

async function extractTextFromScreenshot(imagePath, apiKey) {
  const { OpenAI } = await import("openai");
  const openai = new OpenAI({ apiKey });
  const base64 = (await fs.readFile(imagePath)).toString("base64");
  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [{
      role: "user",
      content: [
        { type: "image_url", image_url: { url: `data:image/png;base64,${base64}` } },
        { type: "text", text: "Extract all visible text from this screenshot and return it as markdown." }
      ]
    }]
  });
  return response.choices[0].message.content;
}

async function callLLM(prompt, settings) {
  const provider = settings.preferred_llm || "openai";

  if (provider === "openai") {
    const { OpenAI } = await import("openai");
    const openai = new OpenAI({ apiKey: settings.openai_api_key });
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: prompt }]
    });
    return response.choices[0].message.content;
  } else if (provider === "anthropic") {
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    const anthropic = new Anthropic({ apiKey: settings.anthropic_api_key });
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 4000,
      messages: [{ role: "user", content: prompt }]
    });
    return response.content[0].text;
  } else if (provider === "gemini") {
    const { GoogleGenAI } = await import("@google/genai");
    const ai = new GoogleGenAI({ apiKey: settings.gemini_api_key });
    const response = await ai.models.generateContent({
      model: "gemini-2.5-pro",
      contents: prompt
    });
    return response.text;
  } else {
    throw new Error(`Unsupported LLM provider: ${provider}`);
  }
}

export async function processCvGeneration(jobId) {
  // 1. Fetch job lead
  const { data: job } = await directus.request(`/items/job_leads/${jobId}`);
  if (!job) throw new Error("Job not found");

  // 2. Fetch App Settings
  const { data: settings } = await directus.request(`/items/app_settings`);
  if (!settings) throw new Error("App settings not configured");

  let description = job.description;

  // 3. If no description, take screenshot and extract via markitdown
  if (!description) {
    if (!settings.openai_api_key) {
      throw new Error("OpenAI API Key is required for image text extraction (markitdown uses OpenAI Vision).");
    }
    const screenshotPath = path.resolve(`data/screenshot-${jobId}.png`);
    await takeScreenshot(job.url, screenshotPath);
    description = await extractTextFromScreenshot(screenshotPath, settings.openai_api_key);
    
    // Save extracted description to job lead
    await directus.request(`/items/job_leads/${jobId}`, {
      method: "PATCH",
      body: JSON.stringify({ description })
    });
    
    // Cleanup screenshot
    try { await fs.unlink(screenshotPath); } catch (e) {}
  }

  // 4. Fetch Base CV
  const { data: baseCv } = await directus.request(`/items/base_cv`);
  if (!baseCv || !baseCv.content) {
    throw new Error("Base CV not found. Please add your master CV to the base_cv collection.");
  }

  // 5. Generate ATS Optimized CV
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

  // 6. Convert Markdown to PDF
  const pdfPath = path.resolve(`data/cv-${jobId}.pdf`);
  const pdfBuffer = await mdToPdf({ content: generatedMarkdown }).catch(console.error);
  if (pdfBuffer) {
    await fs.writeFile(pdfPath, pdfBuffer.content);
  }

  // 7. Upload PDF to Directus Files
  let fileId = null;
  if (pdfBuffer) {
    const formData = new FormData();
    const blob = new Blob([pdfBuffer.content], { type: "application/pdf" });
    formData.append("file", blob, `cv-${jobId}.pdf`);
    
    // Wait, node-fetch/undici supports FormData, but let's use manual upload or the simpler base64 via API
    // Actually directus REST API /files accepts multipart/form-data.
    const uploadRes = await fetch(`${process.env.DIRECTUS_URL}/files`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.DIRECTUS_TOKEN}`,
      },
      body: formData
    });
    const uploadData = await uploadRes.json();
    if (uploadData.data && uploadData.data.id) {
      fileId = uploadData.data.id;
    }
    
    // Cleanup PDF
    try { await fs.unlink(pdfPath); } catch (e) {}
  }

  // 8. Update Job Lead with Generated CV
  await directus.request(`/items/job_leads/${jobId}`, {
    method: "PATCH",
    body: JSON.stringify({
      generated_cv: generatedMarkdown,
      generated_cv_pdf: fileId
    })
  });

  return { success: true, markdown: generatedMarkdown, fileId };
}
