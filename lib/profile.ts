export const profileFields = "id,handle,nickname,major,interests,bio,created_at,updated_at";
export const reservedHandles = ["admin", "api", "auth", "login", "settings", "u", "me", "explore", "bookmarks"];
const limits = { handle: 30, nickname: 30, major: 50, interests: 100, bio: 200 };
export type ProfileInput = Partial<Record<keyof typeof limits, string>>;

export class ApiError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function normalizeHandle(value: string): string {
  const handle = value.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$/.test(handle) || reservedHandles.includes(handle)) {
    throw new ApiError(400, "INVALID_INPUT", "개인 주소는 영문 소문자·숫자·하이픈 3~30자로 입력하고 양 끝은 영문 또는 숫자로 지정해주세요. 예약된 주소는 사용할 수 없습니다.");
  }
  return handle;
}

export function parseProfile(value: unknown, mode: "create" | "update"): ProfileInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ApiError(400, "INVALID_INPUT", "프로필은 JSON 객체로 입력해주세요.");
  }
  const input = value as Record<string, unknown>;
  const output: ProfileInput = {};
  for (const [key, raw] of Object.entries(input)) {
    if (!Object.hasOwn(limits, key) || typeof raw !== "string") {
      throw new ApiError(400, "INVALID_INPUT", "허용된 프로필 항목을 문자열로 입력해주세요.");
    }
    const field = key as keyof typeof limits;
    const text = raw.trim();
    if (/\p{Cc}/u.test(text) || Array.from(text).length > limits[field]) {
      throw new ApiError(400, "INVALID_INPUT", `${key}의 길이 또는 문자를 확인해주세요.`);
    }
    if (field === "nickname" && Array.from(text).length < 2) {
      throw new ApiError(400, "INVALID_INPUT", "닉네임은 2~30자로 입력해주세요.");
    }
    output[field] = field === "handle" ? normalizeHandle(text) : text;
  }
  if (mode === "create") {
    if (!output.handle || !output.nickname) {
      throw new ApiError(400, "INVALID_INPUT", "닉네임과 개인 주소를 입력해주세요.");
    }
    output.major ??= "";
    output.interests ??= "";
    output.bio ??= "";
  } else if (Object.keys(output).length === 0) {
    throw new ApiError(400, "INVALID_INPUT", "수정할 항목을 입력해주세요.");
  }
  return output;
}
