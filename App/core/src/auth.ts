import { SignatureV4 } from '@smithy/signature-v4';
import { Sha256 } from '@aws-crypto/sha256-js';
import { AuthenticationDetails, AuthenticationDetailsAWSSig } from './model';

// A request after variable substitution, ready to be authenticated and sent
export interface PreparedRequest {
  method: string;                          // upper-case, e.g. 'POST'
  url: string;                             // absolute, e.g. 'https://api.example.com/items?x=1'
  headers: { [header: string]: string };
  body: string | undefined;                // exactly the bytes that will be sent
}

// Returns a copy of request with the authentication applied. 'inherit' must already have been resolved.
export async function applyAuthentication(request: PreparedRequest,
                                          auth: AuthenticationDetails | undefined,
                                          signingDate: Date = new Date()): Promise<PreparedRequest> {
  switch (auth?.authentication) {
    case 'basicauth':
      return withHeader(request, 'Authorization', `Basic ${base64(`${auth.basicAuth.userName}:${auth.basicAuth.password}`)}`);
    case 'bearertoken':
      return withHeader(request, 'Authorization', `Bearer ${auth.bearerToken.token}`);
    case 'awssig':
      return signAwsSigV4(request, auth.awsSig, signingDate);
    default:
      return request;
  }
}

function withHeader(request: PreparedRequest, name: string, value: string): PreparedRequest {
  return { ...request, headers: { ...request.headers, [name]: value } };
}

function base64(text: string): string {
  let binary = '';
  new TextEncoder().encode(text).forEach(byte => binary += String.fromCharCode(byte));
  return btoa(binary);
}

async function signAwsSigV4(request: PreparedRequest, aws: AuthenticationDetailsAWSSig, signingDate: Date): Promise<PreparedRequest> {
  const url = new URL(request.url);
  const query: { [key: string]: string } = {};
  url.searchParams.forEach((value, key) => query[key] = value);

  const signer = new SignatureV4({
    service: aws.serviceName,
    region: aws.awsRegion,
    credentials: { accessKeyId: aws.accessKey, secretAccessKey: aws.secretKey },
    sha256: Sha256
  });

  const unsigned = {
    method: request.method,
    protocol: url.protocol,
    hostname: url.hostname,
    port: url.port ? Number(url.port) : undefined,
    path: url.pathname,
    query,
    headers: { ...request.headers, host: url.host },
    body: request.body
  };

  if (!aws.signUrl) {
    const signed = await signer.sign(unsigned, { signingDate });
    return { ...request, headers: signed.headers };
  }

  const presigned = await signer.presign(unsigned, { signingDate });
  const signedUrl = new URL(request.url);
  signedUrl.search = new URLSearchParams(presigned.query as { [key: string]: string }).toString();
  return { ...request, url: signedUrl.toString(), headers: presigned.headers };
}
