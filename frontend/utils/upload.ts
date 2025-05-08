export const fileToBase64 = async (file: File): Promise<string> => {
  const reader = new FileReader();
  const fileBase64Promise = new Promise<string>((resolve) => {
    reader.onloadend = () => {
      const base64String = reader.result as string;
      const base64Content = base64String.split(",")[1];
      resolve(base64Content);
    };
    reader.readAsDataURL(file);
  });

  const fileBase64 = await fileBase64Promise;

  return fileBase64;
};
