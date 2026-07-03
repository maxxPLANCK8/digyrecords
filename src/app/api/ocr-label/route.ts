type OcrResult = {
  name: string;
  phone: string;
};

function cleanOcrResult(value: unknown): OcrResult {
  if (!value || typeof value !== "object") {
    return { name: "", phone: "" };
  }

  const result = value as Partial<Record<keyof OcrResult, unknown>>;

  return {
    name: typeof result.name === "string" ? result.name.trim() : "",
    phone: typeof result.phone === "string" ? result.phone.trim() : "",
  };
}

export async function POST(req: Request) {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return Response.json(
      { name: "", phone: "", error: "Gemini OCR is not configured." },
      { status: 503 },
    );
  }

  const { imageBase64 } = (await req.json()) as { imageBase64?: string };

  if (!imageBase64) {
    return Response.json({ name: "", phone: "" }, { status: 400 });
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: `This is a photo of a Kenyan courier parcel label (Kilimall or similar). Find the line starting with "To:" and extract the recipient's name and phone number from that line only. Ignore all other numbers on the label (tracking numbers, shop phone numbers, remark codes). Respond with ONLY raw JSON, no markdown, no explanation, in this exact shape: {"name": "...", "phone": "..."}. If you cannot find a clear "To:" line, respond {"name": "", "phone": ""}.`,
              },
              {
                inline_data: {
                  mime_type: "image/jpeg",
                  data: imageBase64,
                },
              },
            ],
          },
        ],
        generationConfig: {
          responseMimeType: "application/json",
        },
      }),
    },
  ).catch(() => null);

  if (!response?.ok) {
    return Response.json({ name: "", phone: "" }, { status: 502 });
  }

  const data = await response.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}";

  try {
    return Response.json(cleanOcrResult(JSON.parse(text.trim())));
  } catch {
    return Response.json({ name: "", phone: "" });
  }
}
