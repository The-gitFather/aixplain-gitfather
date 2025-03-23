// app/api/analyze/route.ts
import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { GoogleAIFileManager } from "@google/generative-ai/server";
import { writeFile } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { WHITEBOARD_PROMPT } from "@/lib/prompts";

const apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY;
const genAI = new GoogleGenerativeAI(apiKey!);
const fileManager = new GoogleAIFileManager(apiKey!);

const model = genAI.getGenerativeModel({
  model: "gemini-1.5-flash",
});

export async function POST(request: NextRequest) {
  try {
    // console.log(apiKey);
    const data = await request.json();
    const { imageData } = data;

    if (!imageData) {
      return NextResponse.json(
        { error: "Image data is required" },
        { status: 400 }
      );
    }

    // Create a temporary file path using OS temp directory
    const tempFilePath = join(tmpdir(), `drawing-${Date.now()}.png`);

    // Convert base64 to buffer and save to temp file
    const base64Data = imageData.replace(/^data:image\/\w+;base64,/, "");
    const buffer = Buffer.from(base64Data, "base64");
    await writeFile(tempFilePath, buffer);

    try {
      // Upload file to Gemini

      // Helper function to wait
  const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
  
  try {
    // Step 1: Execute the pipeline
    const executionResponse = await fetch('https://platform-api.aixplain.com/assets/pipeline/execution/run/67d4297802912431287a3ca6', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        "Doubt-image": imageData
      }),
    });

    if (!executionResponse.ok) {
      throw new Error(`Pipeline execution failed: ${executionResponse.status} ${executionResponse.statusText}`);
    }

    const executionData = await executionResponse.json();
    
    // Extract requestId from the URL
    const requestId = executionData.url.split('/').pop();
    
    // Step 2: Poll for results
    let result;
    let retries = 0;
    
    while (retries < maxRetries) {
      await wait(delayMs);
      
      const retrievalResponse = await fetch(`https://platform-api.aixplain.com/assets/pipeline/execution/check/${requestId}`, {
        method: 'GET',
        headers: {
          'x-api-key': apiKey,
          'Content-Type': 'application/json',
        },
      });

      if (!retrievalResponse.ok) {
        retries++;
        continue;
      }
      
      result = await retrievalResponse.json();
      
      // Check if processing is complete
      if (result.status === 'COMPLETED') {
        return result;
      }
      const uploadResult = await fileManager.uploadFile(tempFilePath, {
        mimeType: "image/png",
        displayName: "Canvas Drawing",
      });

      console.log("File uploaded successfully:", uploadResult.file.uri);

      // Generate content using the uploaded file
      const result = await model.generateContent([
        WHITEBOARD_PROMPT,
        {
          fileData: {
            fileUri: uploadResult.file.uri,
            mimeType: uploadResult.file.mimeType,
          },
        },
      ]);

      const response = await result.response;
      const analysis = response.text();

      // Clean up temp file
      await writeFile(tempFilePath, "");

      return NextResponse.json({ analysis });
    } catch (error) {
      console.error("Gemini API error:", error);
      return NextResponse.json(
        { error: "Failed to analyze with Gemini" },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error("Server error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
