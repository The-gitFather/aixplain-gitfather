import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { GoogleAIFileManager, SchemaType } from "@google/generative-ai/server";
import { writeFile } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { DOUBT_IMAGE_PROMPT } from "@/lib/prompts";

const apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY;
const genAI = new GoogleGenerativeAI(apiKey!);
const fileManager = new GoogleAIFileManager(apiKey!);

// this schema will be followed by the response from Gemini
const analysisSchema = {
  type: SchemaType.OBJECT,
  properties: {
    analysis: {
      type: SchemaType.STRING,
      description: "Detailed step by step solution of the image which is a doubt of a student",
      nullable: false,
    },
    confidenceScore: {
      type: SchemaType.NUMBER,
      description: "Confidence score between 0 and 100",
      nullable: false,
    },
    relatedTopics: {
      type: SchemaType.ARRAY,
      description: "List of related academic topics",
      items: {
        type: SchemaType.STRING,
      },
      nullable: false,
    },
  },
  required: ["analysis", "confidenceScore", "relatedTopics"],
};


const model = genAI.getGenerativeModel({
  model: "gemini-2.0-flash-exp",
  generationConfig: {
    responseMimeType: "application/json",
    responseSchema: analysisSchema,
  },
});

export async function POST(request: NextRequest) {
  try {
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
        displayName: "Doubt Image",
      });

      // Generate content using the uploaded file
      const result = await model.generateContent([
        DOUBT_IMAGE_PROMPT,
        {
          fileData: {
            fileUri: uploadResult.file.uri,
            mimeType: uploadResult.file.mimeType,
          },
        },
      ]);

      const response = await result.response;
      const text = response.text();

      // Parse the JSON response
      let parsedResponse;
      try {
        parsedResponse = JSON.parse(
          text
        );
        // console.log(parsedResponse);
      } catch (error) {
        console.error("Failed to parse Gemini response as JSON:", error);
        return NextResponse.json(
          { error: "Invalid response format from Gemini" },
          { status: 500 }
        );
      }

      // Clean up temp file
      await writeFile(tempFilePath, "");

      return NextResponse.json(parsedResponse);
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
