from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from parser import image_to_base64
from llm_chain import extract_lab_data
import json

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.post("/extract")
async def extract(file: UploadFile = File(...), model: str = "gpt-4o-mini"):

    image_bytes = await file.read()
    image_b64 = image_to_base64(image_bytes)

    result = extract_lab_data(image_b64, model)

    cleaned = result.strip()

    if cleaned.startswith("```"):
        cleaned = cleaned.replace("```json", "")
        cleaned = cleaned.replace("```", "")
        cleaned = cleaned.strip()

    try:
        return json.loads(cleaned)
    except:
        return {"raw_output": cleaned}