import { fetchAuthSession } from "aws-amplify/auth";
import fetchHTTPClient from "./fetchHTTPClient";

export interface ResumeEntry {
  type: "experience" | "education" | "project" | string;
  title?: string;
  organization?: string;
  startDate?: string;
  endDate?: string;
  description?: string;
}

export interface TailoredResumeEntry {
  original: ResumeEntry;
  tailored: ResumeEntry;
  hasChanges: boolean;
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

export interface TailorMasterResumeBody {
  jobDescription: string;
}

export interface TailorMasterResumeResponseBody {
  resumeItems: TailoredResumeEntry[];
}

export interface GetTailoredResumesResponseBody {
  files: { name: string; url: string }[];
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

  static async tailorMasterResume(
    jobDescription: string
  ): Promise<TailorMasterResumeResponseBody> {
    const tailorMasterResumeRequestBody: TailorMasterResumeBody = {
      jobDescription,
    };
    return await fetchHTTPClient<TailorMasterResumeResponseBody>(`/tailor`, {
      method: "POST",
      body: JSON.stringify(tailorMasterResumeRequestBody),
      headers: {
        Authorization: `Bearer ${
          (await fetchAuthSession()).tokens?.accessToken?.toString() || ""
        }`,
      },
    });
  }

  static async getTailoredResumes(): Promise<GetTailoredResumesResponseBody> {
    return await fetchHTTPClient<GetTailoredResumesResponseBody>(`/tailor`, {
      headers: {
        Authorization: `Bearer ${
          (await fetchAuthSession()).tokens?.accessToken?.toString() || ""
        }`,
      },
    });
  }
}
