import {
  ClientDataType,
  COSEKeyType,
  coseAlgorithmES256,
  coseAlgorithmRS256,
  coseEllipticCurveP256,
  createAssertionSignatureMessage,
  parseAttestationObject,
  parseAuthenticatorData,
  parseClientDataJSON,
  type COSEPublicKey,
} from "@oslojs/webauthn";
import { base64UrlDecode, base64UrlEncode, utf8Encode } from "./encoding";
import { PasskeeperError } from "./errors";
import type { AuthenticatorTransport } from "./webauthn";

export interface RegistrationResponseJSON {
  id: string;
  rawId: string;
  type: "public-key";
  response: {
    attestationObject: string;
    clientDataJSON: string;
    transports?: AuthenticatorTransport[];
  };
  clientExtensionResults?: object;
}

export interface AuthenticationResponseJSON {
  id: string;
  rawId: string;
  type: "public-key";
  response: {
    authenticatorData: string;
    clientDataJSON: string;
    signature: string;
    userHandle?: string | null;
  };
  clientExtensionResults?: object;
}

export type VerifiedRegistrationResponse =
  | {
      verified: true;
      registrationInfo: {
        credential: {
          id: string;
          publicKey: Uint8Array;
          counter: number;
          transports?: AuthenticatorTransport[];
        };
        credentialBackedUp?: boolean;
      };
    }
  | { verified: false };

export type VerifiedAuthenticationResponse =
  | {
      verified: true;
      authenticationInfo: {
        credentialID: string;
        newCounter: number;
      };
    }
  | { verified: false };

export interface VerifyRegistrationOptions {
  response: RegistrationResponseJSON;
  expectedChallenge: string;
  expectedOrigin: string;
  expectedRPID: string;
  requireUserVerification?: boolean;
}

export type VerifyRegistration = (
  options: VerifyRegistrationOptions,
) => Promise<VerifiedRegistrationResponse>;

export const defaultVerifyRegistration: VerifyRegistration = async (options) => {
  try {
    if (options.response.type !== "public-key") {
      return { verified: false } as VerifiedRegistrationResponse;
    }

    const clientDataJSON = base64UrlDecode(options.response.response.clientDataJSON);
    const clientData = parseClientDataJSON(clientDataJSON);

    if (
      clientData.type !== ClientDataType.Create ||
      base64UrlEncode(clientData.challenge) !== options.expectedChallenge ||
      clientData.origin !== options.expectedOrigin ||
      clientData.crossOrigin === true
    ) {
      return { verified: false } as VerifiedRegistrationResponse;
    }

    const attestationObject = parseAttestationObject(
      base64UrlDecode(options.response.response.attestationObject),
    );
    const { authenticatorData } = attestationObject;

    if (
      !authenticatorData.userPresent ||
      (options.requireUserVerification === true && !authenticatorData.userVerified) ||
      !authenticatorData.verifyRelyingPartyIdHash(options.expectedRPID) ||
      authenticatorData.credential === null
    ) {
      return { verified: false } as VerifiedRegistrationResponse;
    }

    const credentialId = base64UrlEncode(authenticatorData.credential.id);

    if (credentialId !== options.response.id || credentialId !== options.response.rawId) {
      return { verified: false } as VerifiedRegistrationResponse;
    }

    const publicKey = serializeCredentialPublicKey(authenticatorData.credential.publicKey);

    return {
      verified: true,
      registrationInfo: {
        credential: {
          id: credentialId,
          publicKey,
          counter: authenticatorData.signatureCounter,
          ...(options.response.response.transports === undefined
            ? {}
            : { transports: filterTransports(options.response.response.transports) }),
        },
      },
    };
  } catch (error) {
    if (error instanceof PasskeeperError) {
      throw error;
    }

    return { verified: false } as VerifiedRegistrationResponse;
  }
};

export interface VerifyAuthenticationOptions {
  response: AuthenticationResponseJSON;
  expectedChallenge: string;
  expectedOrigin: string;
  expectedRPID: string;
  credential: {
    id: string;
    publicKey: Uint8Array<ArrayBuffer>;
    counter: number;
    transports?: AuthenticatorTransport[];
  };
  requireUserVerification?: boolean;
}

export type VerifyAuthentication = (
  options: VerifyAuthenticationOptions,
) => Promise<VerifiedAuthenticationResponse>;

export const defaultVerifyAuthentication: VerifyAuthentication = async (options) => {
  try {
    if (
      options.response.type !== "public-key" ||
      options.response.id !== options.credential.id ||
      options.response.rawId !== options.credential.id
    ) {
      return { verified: false } as VerifiedAuthenticationResponse;
    }

    const clientDataJSON = base64UrlDecode(options.response.response.clientDataJSON);
    const clientData = parseClientDataJSON(clientDataJSON);

    if (
      clientData.type !== ClientDataType.Get ||
      base64UrlEncode(clientData.challenge) !== options.expectedChallenge ||
      clientData.origin !== options.expectedOrigin ||
      clientData.crossOrigin === true
    ) {
      return { verified: false } as VerifiedAuthenticationResponse;
    }

    const authenticatorDataBytes = base64UrlDecode(options.response.response.authenticatorData);
    const authenticatorData = parseAuthenticatorData(authenticatorDataBytes);

    if (
      !authenticatorData.userPresent ||
      (options.requireUserVerification === true && !authenticatorData.userVerified) ||
      !authenticatorData.verifyRelyingPartyIdHash(options.expectedRPID)
    ) {
      return { verified: false } as VerifiedAuthenticationResponse;
    }

    if (
      options.credential.counter !== 0 &&
      authenticatorData.signatureCounter !== 0 &&
      authenticatorData.signatureCounter <= options.credential.counter
    ) {
      return { verified: false } as VerifiedAuthenticationResponse;
    }

    const publicKey = await importStoredPublicKey(options.credential.publicKey);
    const verified = await crypto.subtle.verify(
      publicKey.algorithm,
      publicKey.key,
      normalizeSignature(base64UrlDecode(options.response.response.signature), publicKey.signature),
      copyBytes(createAssertionSignatureMessage(authenticatorDataBytes, clientDataJSON)),
    );

    if (!verified) {
      return { verified: false } as VerifiedAuthenticationResponse;
    }

    return {
      verified: true,
      authenticationInfo: {
        credentialID: options.credential.id,
        newCounter: authenticatorData.signatureCounter,
      },
    };
  } catch {
    return { verified: false } as VerifiedAuthenticationResponse;
  }
};

type StoredPublicKey =
  | {
      kty: "EC";
      alg: "ES256";
      crv: "P-256";
      x: string;
      y: string;
    }
  | {
      kty: "RSA";
      alg: "RS256";
      n: string;
      e: string;
    };

function serializeCredentialPublicKey(publicKey: COSEPublicKey): Uint8Array {
  if (
    publicKey.type() === COSEKeyType.EC2 &&
    publicKey.algorithm() === coseAlgorithmES256 &&
    publicKey.ec2().curve === coseEllipticCurveP256
  ) {
    const ec2 = publicKey.ec2();
    return utf8Encode(
      JSON.stringify({
        kty: "EC",
        alg: "ES256",
        crv: "P-256",
        x: base64UrlEncode(bigIntToFixedBytes(ec2.x, 32)),
        y: base64UrlEncode(bigIntToFixedBytes(ec2.y, 32)),
      } satisfies StoredPublicKey),
    );
  }

  if (publicKey.type() === COSEKeyType.RSA && publicKey.algorithm() === coseAlgorithmRS256) {
    const rsa = publicKey.rsa();
    return utf8Encode(
      JSON.stringify({
        kty: "RSA",
        alg: "RS256",
        n: base64UrlEncode(bigIntToMinimalBytes(rsa.n)),
        e: base64UrlEncode(bigIntToMinimalBytes(rsa.e)),
      } satisfies StoredPublicKey),
    );
  }

  throw new PasskeeperError({
    code: "verification_failed",
    message: "Registration credential uses an unsupported public key algorithm.",
  });
}

async function importStoredPublicKey(publicKey: Uint8Array): Promise<{
  key: CryptoKey;
  algorithm:
    | { name: "ECDSA"; hash: "SHA-256" }
    | { name: "RSASSA-PKCS1-v1_5" };
  signature: "ecdsa" | "rsa";
}> {
  const stored = JSON.parse(new TextDecoder().decode(publicKey)) as StoredPublicKey;

  if (stored.kty === "EC" && stored.alg === "ES256" && stored.crv === "P-256") {
    return {
      key: await crypto.subtle.importKey(
        "jwk",
        {
          kty: "EC",
          crv: "P-256",
          x: stored.x,
          y: stored.y,
          ext: true,
        },
        { name: "ECDSA", namedCurve: "P-256" },
        false,
        ["verify"],
      ),
      algorithm: { name: "ECDSA", hash: "SHA-256" },
      signature: "ecdsa",
    };
  }

  if (stored.kty === "RSA" && stored.alg === "RS256") {
    return {
      key: await crypto.subtle.importKey(
        "jwk",
        {
          kty: "RSA",
          n: stored.n,
          e: stored.e,
          ext: true,
        },
        { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
        false,
        ["verify"],
      ),
      algorithm: { name: "RSASSA-PKCS1-v1_5" },
      signature: "rsa",
    };
  }

  throw new PasskeeperError({
    code: "verification_failed",
    message: "Authentication credential uses an unsupported public key algorithm.",
  });
}

function bigIntToFixedBytes(value: bigint, length: number): Uint8Array {
  const bytes = bigIntToMinimalBytes(value);

  if (bytes.length > length) {
    throw new PasskeeperError({
      code: "verification_failed",
      message: "Public key coordinate is longer than expected.",
    });
  }

  const fixed = new Uint8Array(length);
  fixed.set(bytes, length - bytes.length);
  return fixed;
}

function bigIntToMinimalBytes(value: bigint): Uint8Array {
  if (value === 0n) {
    return new Uint8Array([0]);
  }

  const bytes: number[] = [];
  let remaining = value;

  while (remaining > 0n) {
    bytes.unshift(Number(remaining & 0xffn));
    remaining >>= 8n;
  }

  return new Uint8Array(bytes);
}

function filterTransports(transports: AuthenticatorTransport[]): AuthenticatorTransport[] {
  return transports.filter(
    (transport) =>
      transport === "ble" ||
      transport === "hybrid" ||
      transport === "internal" ||
      transport === "nfc" ||
      transport === "usb",
  );
}

function copyBytes(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy;
}

function normalizeSignature(signature: Uint8Array, type: "ecdsa" | "rsa"): Uint8Array<ArrayBuffer> {
  if (type === "rsa" || signature.byteLength === 64) {
    return copyBytes(signature);
  }

  return derToRawEcdsaSignature(signature);
}

function derToRawEcdsaSignature(signature: Uint8Array): Uint8Array<ArrayBuffer> {
  if (signature.byteLength < 2 || signature[0] !== 0x30) {
    throw new PasskeeperError({
      code: "verification_failed",
      message: "ECDSA signature is not raw or DER encoded.",
    });
  }

  let offset = 2;
  const sequenceLength = signature[1];

  if (sequenceLength === undefined) {
    throw new PasskeeperError({
      code: "verification_failed",
      message: "ECDSA signature is missing a DER sequence length.",
    });
  }

  if (sequenceLength + 2 !== signature.byteLength) {
    throw new PasskeeperError({
      code: "verification_failed",
      message: "ECDSA signature has an invalid DER sequence length.",
    });
  }

  const r = readDerInteger(signature, offset);
  offset = r.nextOffset;
  const s = readDerInteger(signature, offset);

  if (s.nextOffset !== signature.byteLength) {
    throw new PasskeeperError({
      code: "verification_failed",
      message: "ECDSA signature has trailing DER data.",
    });
  }

  const raw = new Uint8Array(64);
  raw.set(integerToFixedBytes(r.value, 32), 0);
  raw.set(integerToFixedBytes(s.value, 32), 32);
  return raw;
}

function readDerInteger(signature: Uint8Array, offset: number): {
  value: Uint8Array;
  nextOffset: number;
} {
  if (signature[offset] !== 0x02) {
    throw new PasskeeperError({
      code: "verification_failed",
      message: "ECDSA signature has an invalid DER integer.",
    });
  }

  const length = signature[offset + 1];

  if (length === undefined) {
    throw new PasskeeperError({
      code: "verification_failed",
      message: "ECDSA signature is missing a DER integer length.",
    });
  }
  const start = offset + 2;
  const end = start + length;

  if (end > signature.byteLength) {
    throw new PasskeeperError({
      code: "verification_failed",
      message: "ECDSA signature has a truncated DER integer.",
    });
  }

  return {
    value: signature.slice(start, end),
    nextOffset: end,
  };
}

function integerToFixedBytes(value: Uint8Array, length: number): Uint8Array {
  let normalized = value;

  while (normalized.length > 0 && normalized[0] === 0) {
    normalized = normalized.slice(1);
  }

  if (normalized.length > length) {
    throw new PasskeeperError({
      code: "verification_failed",
      message: "ECDSA signature integer is longer than expected.",
    });
  }

  const fixed = new Uint8Array(length);
  fixed.set(normalized, length - normalized.length);
  return fixed;
}
