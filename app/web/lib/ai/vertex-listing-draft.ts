import { VertexAI } from "@google-cloud/vertexai";
import type { GoogleAuthOptions } from "google-auth-library";
import {
  LISTING_DESCRIPTION_SYSTEM_INSTRUCTION,
  buildListingDescriptionUserText,
  type ListingDescriptionDraftBody,
} from "./listing-description-prompt";

const DEFAULT_MODEL = "gemini-2.5-flash";

function vertexInit(): { project: string; location: string; googleAuthOptions?: GoogleAuthOptions } {
  const project =
    process.env.GOOGLE_CLOUD_PROJECT?.trim() || process.env.GCP_PROJECT?.trim() || "";
  const location =
    process.env.VERTEX_LOCATION?.trim() ||
    process.env.GOOGLE_CLOUD_LOCATION?.trim() ||
    "us-central1";

  if (!project) {
    throw new Error("GOOGLE_CLOUD_PROJECT（または GCP_PROJECT）が未設定です。");
  }

  const rawJson = process.env.GCP_SERVICE_ACCOUNT_JSON?.trim();
  if (rawJson) {
    let credentials: Record<string, unknown>;
    try {
      credentials = JSON.parse(rawJson) as Record<string, unknown>;
    } catch {
      throw new Error("GCP_SERVICE_ACCOUNT_JSON の JSON が不正です。");
    }
    return { project, location, googleAuthOptions: { credentials } };
  }

  return { project, location };
}

export function isVertexListingDraftConfigured(): boolean {
  const project =
    process.env.GOOGLE_CLOUD_PROJECT?.trim() || process.env.GCP_PROJECT?.trim() || "";
  return Boolean(project);
}

export async function generateListingDescriptionWithVertex(body: ListingDescriptionDraftBody): Promise<{
  text: string;
  model: string;
}> {
  const model =
    process.env.GEMINI_MODEL?.trim() || process.env.VERTEX_GEMINI_MODEL?.trim() || DEFAULT_MODEL;
  const init = vertexInit();
  const vertex = new VertexAI({
    project: init.project,
    location: init.location,
    googleAuthOptions: init.googleAuthOptions,
  });

  const generativeModel = vertex.getGenerativeModel({
    model,
    systemInstruction: {
      role: "system",
      parts: [{ text: LISTING_DESCRIPTION_SYSTEM_INSTRUCTION }],
    },
    generationConfig: {
      temperature: 0.6,
      maxOutputTokens: 1024,
    },
  });

  const userText = buildListingDescriptionUserText(body);
  const result = await generativeModel.generateContent({
    contents: [{ role: "user", parts: [{ text: userText }] }],
  });

  const text =
    result.response.candidates?.[0]?.content?.parts
      ?.map((p) => ("text" in p && typeof p.text === "string" ? p.text : ""))
      .join("")
      .trim() ?? "";

  if (!text) {
    throw new Error("Vertex の応答が空でした。");
  }

  return { text, model };
}
