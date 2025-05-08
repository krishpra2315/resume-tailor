import { fetchAuthSession } from "aws-amplify/auth";
import fetchHTTPClient from "./fetchHTTPClient";

export interface UploadResumeBody {
  file: string;
  filename?: string;
}

export interface UploadResumeResponseBody {
  s3_key: string;
}

export default class uploadHTTPClient {
  static async uploadResume(
    file: string,
    filename?: string
  ): Promise<UploadResumeResponseBody> {
    const uploadResumeRequestBody: UploadResumeBody = {
      file,
      filename,
    };
    return await fetchHTTPClient<UploadResumeResponseBody>(`/upload`, {
      method: "POST",
      body: JSON.stringify(uploadResumeRequestBody),
      headers: {
        Authorization: `Bearer ${
          (await fetchAuthSession()).tokens?.accessToken?.toString() || ""
        }`,
      },
    });
  }

  static async uploadResumeGuest(
    file: string
  ): Promise<UploadResumeResponseBody> {
    const uploadResumeGuestRequestBody: UploadResumeBody = {
      file,
    };
    return await fetchHTTPClient<UploadResumeResponseBody>(`/upload-guest`, {
      method: "POST",
      body: JSON.stringify(uploadResumeGuestRequestBody),
    });
  }
}
