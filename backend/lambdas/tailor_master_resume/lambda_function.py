import json
import boto3
from boto3.dynamodb.conditions import Key
import os

s3 = boto3.client("s3")
bedrock = boto3.client("bedrock-runtime", region_name="us-east-2")
dynamodb = boto3.resource("dynamodb")
table = dynamodb.Table("ResumeMetadata")

MODEL_ID = 'arn:aws:bedrock:us-east-2:429744659578:inference-profile/us.anthropic.claude-3-haiku-20240307-v1:0'
BUCKET_NAME = os.environ.get('BUCKET_NAME', '')
def lambda_handler(event, context):
    try:
        body = json.loads(event["body"])
        claims = event.get('requestContext', {}).get('authorizer', {}).get('jwt', {}).get('claims', {})
        user_id = claims.get('sub')
        job_description = body["jobDescription"]

        response = table.get_item(Key={"resume_id": user_id})
        if "Item" not in response or "entries" not in response["Item"]:
            return {
                "statusCode": 404,
                "body": json.dumps({"error": "Master resume not found for user."}),
            }

        resume_entries = response["Item"]["entries"]

        # Step 2: Prompt Claude
        prompt = f"""
You are a Resume Optimization Assistant. Your mission is to construct a tailored, dense, 1-page resume that optimally positions the candidate for a specific job. You will be given a structured resume (as a list of JSON objects) and a job description.

**Inputs:**
1.  Job Description:
    --- JOB DESCRIPTION START ---
    {job_description}
    --- JOB DESCRIPTION END ---

2.  User's Full Resume Entries (JSON list):
    --- USER RESUME ENTRIES (JSON LIST) ---
    {json.dumps(resume_entries)}
    --- USER RESUME ENTRIES (JSON LIST) END ---

**Core Task & Selection Logic:**

1.  **Mandatory Sections:**
    * You **must** always include the `userInfo` object.
    * You **must** always include the `education` object(s). If multiple education entries exist, select the most relevant or recent ones, ensuring at least one is present.
    * You **must** always include the `skills` object. Within the `skills` object, preserve all original skill categories (e.g., "languages," "technologies," "tools"). However, for each category, only populate it with *specific skills* that are demonstrably relevant to the `job_description`. Omit non-relevant skills from these lists.

2.  **Selection of Additional Content (Experience, Projects, Certifications, etc.):**
    * Beyond the mandatory sections (`userInfo`, `education`, `skills`), your goal is to select approximately **4 to 6 additional items** from the user's other resume entries (such as `experience`, `projects`, `certifications`).
    * **Relevance is Paramount:** Prioritize items that show the strongest and most direct alignment with the requirements, keywords, and responsibilities listed in the `job_description`.
    * **Ensuring Page Fullness & Content Density:**
        * If you cannot find 4-6 items of *high* relevance, include the *next most relevant* items to reach the target of 4-6 additional items.
        * If there's uncertainty about including a moderately relevant item, err on the side of inclusion if it helps achieve a fuller page and the item isn't entirely unrelated to the professional profile suggested by the job.
        * Aim for each selected item (e.g., a specific job in `experience`, a particular `project`) to contain substantial descriptive text, ideally averaging 3-5 lines. However, high relevance can justify including a briefer item.

3.  **Overall Goal:** The final output should represent a compelling, single-page resume, rich with high-quality, relevant content that effectively showcases the candidate's fit for the job.

**Output Requirements:**

* Your response **must** be solely a list of JSON objects.
* This list must follow the **exact same structure and format** as the input `resume_entries`. For example, if an experience item in the input is `{{ "type": "experience", "title": "Engineer", ... }}`, its selected counterpart in the output must also be `{{ "type": "experience", "title": "Engineer", ... }}`.
* Do **not** include any introductory text, concluding remarks, comments, or any explanations outside of the JSON structure itself.
"""


        bedrock_response = bedrock.invoke_model(
            modelId=MODEL_ID,
            contentType="application/json",
            accept="application/json",
            body=json.dumps({
                "anthropic_version": "bedrock-2023-05-31",
                "messages": [
                    {
                        "role": "user",
                        "content": prompt
                    }
                ],
                "max_tokens": 2048,
                "temperature": 0.3
            })
        )

        output = json.loads(bedrock_response["body"].read())
        tailored_resume = json.loads(output["content"][0]["text"])

        return {
            "statusCode": 200,
            "body": json.dumps({"resumeItems": tailored_resume})
        }

    except Exception as e:
        return {
            "statusCode": 500,
            "body": json.dumps({"error": str(e)})
        }
