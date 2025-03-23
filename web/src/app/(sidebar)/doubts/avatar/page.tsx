"use client";

import React, { useState, useCallback, useRef } from "react";
import Webcam from "react-webcam";
import { GoogleGenerativeAI } from "@google/generative-ai";
import {
  Calendar,
  Video,
  Share2,
  Settings,
  Send,
  Paperclip,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

// Import regeneratorRuntime polyfill
import "regenerator-runtime/runtime";
// import { Navbar } from "@/components/navbar";

const genAI = new GoogleGenerativeAI("AIzaSyCKCRR56-u5ENjCQ0IfwefNENVslKxKRoY");
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

export default function VideoCall() {
  const [showVideo, setShowVideo] = useState(false);
  const [speechText, setSpeechText] = useState("");
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [conversationHistory, setConversationHistory] = useState("");
  const recognitionRef = useRef<any>(null);
  const synthesisRef = useRef(
    typeof window !== "undefined" ? window.speechSynthesis : null
  );

  if (typeof window !== "undefined" && !("webkitSpeechRecognition" in window)) {
    return <span>Browser doesn&apos;t support speech recognition.</span>;
  }

  const API_KEY = process.env.AIXPLAIN_API_KEY;
const BASE_URL = 'https://models.aixplain.com/api/v1';
const MODEL_ID = '6149e7a19dbf6bdd869a64d1'; // Arabic (Gulf) speech recognition

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { audioData } = req.body;
    
    if (!audioData) {
      return res.status(400).json({ error: 'Audio data is required' });
    }

    // Step 1: Submit the audio
    const executionResponse = await fetch(`${BASE_URL}/execute/${MODEL_ID}`, {
      method: 'POST',
      headers: {
        'x-api-key': API_KEY || '',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        source_audio: audioData
      }),
    });

    if (!executionResponse.ok) {
      throw new Error(`Error: ${executionResponse.status} - ${executionResponse.statusText}`);
    }

    const { requestId } = await executionResponse.json();
    
    // Step 2: Poll for results (simple implementation)
    let retries = 0;
    const maxRetries = 10;
    const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
    
    while (retries < maxRetries) {
      await delay(2000); // Wait 2 seconds between checks
      
      const resultResponse = await fetch(`${BASE_URL}/data/${requestId}`, {
        method: 'GET',
        headers: {
          'x-api-key': API_KEY || '',
          'Content-Type': 'application/json',
        },
      });
      
      if (!resultResponse.ok) {
        retries++;
        continue;
      }
      
      const result = await resultResponse.json();
      
      if (result.completed) {
        return res.status(200).json(result);
      }
      
      retries++;
    }
    
    // If we get here, polling timed out
    return res.status(504).json({ error: 'Transcription timed out' });
  } catch (error) {
    console.error('API error:', error);
    return res.status(500).json({ 
      error: 'Error processing transcription',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }


  const startListening = () => {
    if (synthesisRef.current?.speaking) {
      synthesisRef.current.cancel();
    }

    setShowVideo(false);

    if (!recognitionRef.current) {
      const recognition = new window.webkitSpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = false;
      recognition.lang = "en-US";

      recognition.onresult = (event: any) => {
        const transcriptArray = Array.from(event.results)
          .map((result) => result[0])
          .map((result) => result.transcript)
          .join("");
        setTranscript(transcriptArray);
        setConversationHistory(
          (prevHistory) => prevHistory + " User: " + transcriptArray
        );
      };

      recognition.onerror = (event : any) => {
        console.error("Speech recognition error", event.error);
      };

      recognitionRef.current = recognition;
    }

    recognitionRef?.current?.start();
    setListening(true);
  };

  const stopListening = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
    setListening(false);
  };

  const handleGenerate = useCallback(() => {
    const prompt = `
    You are an AI assistant designed to clear users' doubts in an interactive and engaging manner.

    Instructions:
    The user will ask questions related to a topic or field.
    The user will ask questions related to a topic or field.
    Provide clear, concise, and helpful explanations.
    Keep responses friendly, engaging, and polite.
    Do not include your name or any specific user information. Use ${conversationHistory} to maintain context.
    Keep the conversation continuous without repetitive greetings.
    Use simple and easy-to-understand language.
    If needed, ask follow-up questions to clarify the user's doubt further.
    keep the responses short and concise.

    Context of the conversation so far:
    ${conversationHistory}
    ${transcript}

    Please follow the instructions above during the conversation.`;

    model
      .generateContent(prompt)
      .then((result) => {
        const responseGemini = result.response
          .text()
          .replace(/\bjson\b/gi, "")
          .replace(/\\\`/g, "");
        setShowVideo(true);
        setSpeechText(responseGemini);

        setConversationHistory(
          (prevHistory) => `${prevHistory}\nAI: ${responseGemini}`
        );

        const utterance = new SpeechSynthesisUtterance(responseGemini);
        utterance.onend = () => {
          setShowVideo(false);
        };
        utterance.onstart = () => {
          if (recognitionRef.current) {
            recognitionRef.current.stop();
          }
        };
        synthesisRef.current?.speak(utterance);
      })
      .catch((error) => {
        console.error("Error generating text:", error);
      });
  }, [transcript, conversationHistory]);

  return (
    <>
      <div className="min-h-screen bg-background pt-20">
        <div className="container mx-auto p-4">
          <Card className="w-full">
            <CardHeader className="border-b p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
                    <Calendar className="h-6 w-6" />
                  </div>
                  <div>
                    <CardTitle className="text-xl">
                      Weekly Mock Interview [Internal]
                    </CardTitle>
                    <p className="text-sm text-muted-foreground">
                      November 06, 2024 | 11:00 AM
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-2 rounded-full bg-red-100 px-3 py-1">
                    <span className="h-2 w-2 rounded-full bg-red-500" />
                    <span className="text-sm text-red-500">
                      Recording in Progress...
                    </span>
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="grid grid-cols-[1fr,300px]">
                <div className="p-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="aspect-video rounded-lg overflow-hidden bg-muted">
                      {!showVideo && (
                        <img
                          src="/still.png"
                          alt="Video Call"
                          className="w-full h-full object-cover"
                        />
                      )}
                      {showVideo && (
                        <video
                          src="/Mentor.mp4"
                          autoPlay
                          loop
                          muted
                          className="w-full h-full object-cover"
                        />
                      )}
                    </div>
                    <div className="aspect-video rounded-lg overflow-hidden bg-muted">
                      <Webcam
                        className="w-full h-full object-cover"
                        audio={false}
                      />
                    </div>
                  </div>
                  <div className="flex items-center justify-center gap-4 p-4 border-t mt-4">
                    <Button
                      onClick={startListening}
                      disabled={listening}
                      className={`bg-green-500 hover:bg-green-700 text-white rounded-full px-4 py-2 transition-all duration-300 ${
                        listening ? "opacity-50 cursor-not-allowed" : ""
                      }`}
                    >
                      Start Listening
                    </Button>

                    <Button
                      onClick={stopListening}
                      disabled={!listening}
                      className={`bg-red-500 hover:bg-red-700 text-white rounded-full px-4 py-2 transition-all duration-300 ${
                        !listening ? "opacity-50 cursor-not-allowed" : ""
                      }`}
                    >
                      Stop Listening
                    </Button>

                    <Button
                      onClick={handleGenerate}
                      className={`bg-blue-500 hover:bg-blue-700 text-white rounded-full px-4 py-2 transition-all duration-300`}
                    >
                      Converse
                    </Button>
                  </div>
                </div>
                <div className="border-l">
                  <div className="p-4 border-b">
                    <h3 className="font-semibold mb-2">Participants (2)</h3>
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Avatar>
                          <AvatarImage src="/avatar1.jpg" />
                          <AvatarFallback>JD</AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="text-sm font-medium">Jacob Jones</p>
                          <p className="text-xs text-muted-foreground">Host</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Avatar>
                          <AvatarImage src="/avatar2.jpg" />
                          <AvatarFallback>YS</AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="text-sm font-medium">You</p>
                        </div>
                      </div>
                    </div>
                  </div>
                  <ScrollArea className="h-[400px] p-4">
                    <div className="space-y-4">
                      <div className="space-y-1">
                        <p className="text-sm text-muted-foreground">
                          Transcript:
                        </p>
                        <p className="text-sm">{transcript}</p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-sm text-muted-foreground">
                          History:
                        </p>
                        <p className="text-sm whitespace-pre-wrap">
                          {conversationHistory}
                        </p>
                      </div>
                    </div>
                  </ScrollArea>
                  <div className="p-4">
                    <div className="flex items-center gap-2">
                      <Paperclip className="h-6 w-6 text-muted-foreground" />
                      <Input placeholder="Add a note..." />
                      <Button variant="outline">
                        <Send className="h-4 w-4 text-muted-foreground" />
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
