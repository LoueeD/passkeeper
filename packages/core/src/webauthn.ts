export type PublicKeyCredentialType = "public-key";
export type AuthenticatorTransport = "ble" | "hybrid" | "internal" | "nfc" | "usb";
export type ResidentKeyRequirement = "discouraged" | "preferred" | "required";
export type UserVerificationRequirement = "discouraged" | "preferred" | "required";
export type AttestationConveyancePreference = "direct" | "enterprise" | "indirect" | "none";

export interface PublicKeyCredentialRpEntity {
  id: string;
  name: string;
}

export interface PublicKeyCredentialUserEntity {
  id: string;
  name: string;
  displayName: string;
}

export interface PublicKeyCredentialParameters {
  type: PublicKeyCredentialType;
  alg: number;
}

export interface AuthenticatorSelectionCriteria {
  residentKey?: ResidentKeyRequirement;
  userVerification?: UserVerificationRequirement;
}

export interface PublicKeyCredentialDescriptor {
  type: PublicKeyCredentialType;
  id: string;
  transports?: AuthenticatorTransport[];
}

export interface PublicKeyCredentialCreationOptionsJSON {
  rp: PublicKeyCredentialRpEntity;
  user: PublicKeyCredentialUserEntity;
  challenge: string;
  pubKeyCredParams: PublicKeyCredentialParameters[];
  timeout: number;
  excludeCredentials: PublicKeyCredentialDescriptor[];
  authenticatorSelection: AuthenticatorSelectionCriteria;
  attestation: AttestationConveyancePreference;
}

export interface PublicKeyCredentialRequestOptionsJSON {
  challenge: string;
  timeout: number;
  rpId: string;
  allowCredentials: PublicKeyCredentialDescriptor[];
  userVerification: UserVerificationRequirement;
}

export const DEFAULT_PUBLIC_KEY_CREDENTIAL_PARAMETERS: PublicKeyCredentialParameters[] = [
  { type: "public-key", alg: -7 },
  { type: "public-key", alg: -257 },
];
