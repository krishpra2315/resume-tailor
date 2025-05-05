import { fetchAuthSession } from "aws-amplify/auth";
import fetchHTTPClient from "./fetchHTTPClient";

interface ResumeEntry {
  type: "experience" | "education" | "project" | string;
  title?: string;
  organization?: string;
  startDate?: string;
  endDate?: string;
  description?: string;
}

export interface GetMasterResumeResponseBody {
  url: string;
  entries: ResumeEntry[];
}

export interface ProcessMasterResumeBody {
  file: string;
}

export interface ProcessMasterResumeResponseBody {
  s3_key: string;
}

export default class masterHTTPClient {
  static async processMasterResume(
    file: string
  ): Promise<ProcessMasterResumeResponseBody> {
    const processMasterResumeRequestBody: ProcessMasterResumeBody = {
      file,
    };
    return await fetchHTTPClient<ProcessMasterResumeResponseBody>(`/master`, {
      method: "POST",
      body: JSON.stringify(processMasterResumeRequestBody),
      headers: {
        Authorization: `Bearer ${
          (await fetchAuthSession()).tokens?.accessToken?.toString() || ""
        }`,
      },
    });
  }

  static async getMasterResume(): Promise<GetMasterResumeResponseBody> {
    return await fetchHTTPClient<GetMasterResumeResponseBody>(`/master`, {
      headers: {
        Authorization: `Bearer ${
          (await fetchAuthSession()).tokens?.accessToken?.toString() || ""
        }`,
      },
    });
  }
}
