export type AuthUser = {
  sub: string;
  role: string;
  username: string | null;
  email: string | null;
  branchCode: string | null;
  branchName: string | null;
  isInternal?: boolean;
};
