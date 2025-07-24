import fetchHTTPClient from "./fetchHTTPClient";

export interface ScoreResumeBody {
  s3_key: string;
  job_description: string;
}

export interface ScoreResumeResponseBody {
  resultId: string;
}

export interface GetScoreResponseBody {
  resultId: string;
  fileContent: string;
  jobDescription: string;
  score: number;
  feedback: string;
}

export default class scoreHTTPClient {
  static async scoreResume(
    s3_key: string,
    job_description: string
  ): Promise<ScoreResumeResponseBody> {
    const scoreResumeRequestBody: ScoreResumeBody = {
      s3_key,
      job_description,
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
