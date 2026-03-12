import os
from dotenv import load_dotenv
from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage

load_dotenv()

api_key = os.getenv("OPENAI_API_KEY")

def extract_lab_data(image_b64, model_choice):

    llm = ChatOpenAI(
        model=model_choice,
        api_key=api_key,
        max_tokens=2000
    )

    prompt = """
You are an advanced medical lab report OCR and data extraction system.

The lab report image may contain:
- Printed text
- Tables
- Handwritten notes

Extract ALL information and categorize it into 3 sections.

Return ONLY valid JSON in the following format:

{
  "normal_text_data": {
      "patient_name": "",
      "age": "",
      "gender": "",
      "report_date": "",
      "doctor_name": "",
      "hospital_or_lab": ""
  },

  "table_data": [
      {
        "test_name": "",
        "result": "",
        "unit": "",
        "reference_range": ""
      }
  ],

  "handwritten_data": {
      "notes": ""
  }
}

Rules:
- Extract printed patient information into normal_text_data
- Extract table rows into table_data
- Extract handwritten notes or prescriptions into handwritten_data
- If any value is missing write "Not visible"
- Return ONLY JSON
"""

    message = HumanMessage(
        content=[
            {
                "type": "image_url",
                "image_url": {
                    "url": f"data:image/png;base64,{image_b64}"
                }
            },
            {"type": "text", "text": prompt}
        ]
    )

    response = llm.invoke([message])

    return response.content