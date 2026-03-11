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
You are a medical lab report data extractor.

Extract all information and return JSON:

{
  "patient_information": {
      "name": "",
      "age": "",
      "gender": "",
      "report_date": ""
  },
  "doctor_information": {
      "doctor_name": "",
      "hospital_or_lab": ""
  },
  "test_results": [
      {
        "test_name": "",
        "result": "",
        "unit": "",
        "reference_range": ""
      }
  ],
  "additional_notes": ""
}
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