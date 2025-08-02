import fetchHTTPClient from "./fetchHTTPClient";

export interface ScoreResumeBody {
  s3_key: string;
  job_description: string;
  with_auth?: boolean; // Optional parameter for authentication status
}

export interface ScoreResumeResponseBody {
  resultId: string;
}

export interface GetScoreResponseBody {
  resultId: string;
  fileContent: string;
  jobDescription: string;
  score: number;
  feedback: string[]; // Changed back to string[] since backend now returns an array
}

export default class scoreHTTPClient {
  static async scoreResume(
    s3_key: string,
    job_description: string,
    with_auth: boolean = false // Default to false for backward compatibility
  ): Promise<ScoreResumeResponseBody> {
    const scoreResumeRequestBody: ScoreResumeBody = {
      s3_key,
      job_description,
      with_auth,
    };

    return await fetchHTTPClient<ScoreResumeResponseBody>(`/score`, {
      method: "POST",
      body: JSON.stringify(scoreResumeRequestBody),
    });
  }

  static async getScore(resultId: string): Promise<GetScoreResponseBody> {
    return await fetchHTTPClient<GetScoreResponseBody>(
      `/score?resultId=${resultId}`
    );
  }
}
