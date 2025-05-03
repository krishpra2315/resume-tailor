import fetchHTTPClient from "./fetchHTTPClient";

export interface UploadResumeGuestBody {
  file: string;
  filename: string;
}

export interface UploadResumeGuestResponseBody {
  s3_key: string;
}

export default class uploadHTTPClient {
  static async uploadResumeGuest(
    file: string,
    filename: string
  ): Promise<UploadResumeGuestResponseBody> {
    const uploadResumeGuestRequestBody: UploadResumeGuestBody = {
      file,
      filename,
    };
    return await fetchHTTPClient<UploadResumeGuestResponseBody>(
      `/upload-guest`,
      {
        method: "POST",
        body: JSON.stringify(uploadResumeGuestRequestBody),
        credentials: "include",
      }
    );
  }
}
