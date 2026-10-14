import { CreateBucketCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'

export type RecordingMetadata = {
  organizationId: string
  callId: string
  recordingSid: string
  sourceUrl: string
  contentType: string
}

export interface ObjectStorage {
  putRecordingMetadata(input: RecordingMetadata): Promise<{ key: string; url: string }>
}

export class MemoryObjectStorage implements ObjectStorage {
  readonly objects: Array<{ key: string; url: string }> = []

  async putRecordingMetadata(input: RecordingMetadata): Promise<{ key: string; url: string }> {
    const key = `recordings/${input.organizationId}/${input.callId}/${input.recordingSid}.json`
    const url = `memory://${key}`
    this.objects.push({ key, url })
    return { key, url }
  }
}

export class S3ObjectStorage implements ObjectStorage {
  private readonly client: S3Client
  private readonly ready: Promise<void>

  constructor(
    private readonly bucket: string,
    endpoint: string,
    accessKey: string,
    secretKey: string,
    private readonly logger: { warn: (event: string, fields?: Record<string, unknown>) => void },
  ) {
    this.client = new S3Client({
      region: 'us-east-1',
      endpoint,
      forcePathStyle: true,
      credentials: { accessKeyId: accessKey, secretAccessKey: secretKey },
    })
    this.ready = this.ensureBucket()
  }

  private async ensureBucket(): Promise<void> {
    try {
      await this.client.send(new CreateBucketCommand({ Bucket: this.bucket }))
    } catch (error) {
      const name = error instanceof Error ? error.name : 'Error'
      if (name !== 'BucketAlreadyExists' && name !== 'BucketAlreadyOwnedByYou') {
        this.logger.warn('storage.bucket_unavailable', { error: name })
      }
    }
  }

  async putRecordingMetadata(input: RecordingMetadata): Promise<{ key: string; url: string }> {
    await this.ready
    const key = `recordings/${input.organizationId}/${input.callId}/${input.recordingSid}.json`
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        ContentType: 'application/json',
        Body: JSON.stringify({
          recordingSid: input.recordingSid,
          contentType: input.contentType,
          sourceUrl: input.sourceUrl,
        }),
      }),
    )
    const endpoint = (process.env.S3_ENDPOINT ?? '').replace(/\/$/, '')
    return { key, url: `${endpoint}/${this.bucket}/${key}` }
  }
}
