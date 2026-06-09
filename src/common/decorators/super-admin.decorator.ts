import { SetMetadata } from "@nestjs/common";

export const SUPER_ADMIN_KEY = "superAdmin";
export const SuperAdmin = () => SetMetadata(SUPER_ADMIN_KEY, true);
