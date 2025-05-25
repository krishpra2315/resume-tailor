

# Resume Tailor – AI-Powered Resume Customization Platform

[**Resume Tailor**](https://resume-tailor-kp.netlify.app/) is an AI-driven web application that automatically tailors a user's resume to a specific job description using AWS services and large language models.

## Key Features

- **Master Resume Storage** – Authenticated users can upload a comprehensive resume, which is stored and structured using DynamoDB
- **Intelligent Tailoring** – Uses Amazon Bedrock LLMs to generate a concise, one-page resume tailored to a job description
- **PDF Parsing & NLP** – Leverages AWS Textract and Comprehend to extract structured content from uploaded resumes
- **Serverless Infrastructure** – Built with AWS Lambda, API Gateway, S3, and DynamoDB for a scalable, cost-efficient backend
- **User Authentication** – Integrated with Amazon Cognito to support both guest and authenticated user flows
- **Resume Scoring** – Automatically evaluates how well a tailored resume matches the job description

## Tech Stack

- **Frontend**: Next.js, TailwindCSS, TypeScript  
- **Backend**: AWS Lambda (Python), API Gateway, DynamoDB  
- **AI/ML**: Amazon Bedrock (Claude), Textract, Comprehend  
- **Authentication**: AWS Cognito  
- **Storage**: S3, DynamoDB

## Impact

- Over **100 users** have used Resume Tailor to generate optimized, job-ready resumes
- Reduced resume tailoring time by **85%** compared to manual editing
- Enabled students and job seekers to quickly adapt to new job postings in minutes

## What I Learned

- Architected a fully serverless, production-ready cloud application using AWS  
- Designed LLM prompts for high-quality, constraint-aware output  
- Developed multi-step data pipelines to parse, clean, and semantically match resume content  
- Balanced performance and security across frontend/backend interactions

## Contributions & Feedback

I'm actively improving the platform and would love to hear your feedback!  
If you’re a recruiter or engineer curious about the project, feel free to [connect with me](https://linkedin.com/in/your-profile).


