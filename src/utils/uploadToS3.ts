import { PutObjectCommand } from "@aws-sdk/client-s3";
import { s3 } from "../config/aws_s3";

export const uploadToS3 = async ({
  bucket,
  key,
  body,
  contentType,
}: {
  bucket: string;
  key: string;
  body: Buffer;
  contentType: string;
}) => {
  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: body,
    ContentType: contentType,
  });

  await s3.send(command);

  return `https://${bucket}.s3.amazonaws.com/${key}`;
};
