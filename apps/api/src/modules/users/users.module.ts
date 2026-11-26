import { Module } from "@nestjs/common";
import { AuthModule } from "@/modules/auth/auth.module";
import { GeocodingModule } from "@/modules/geocoding/geocoding.module";
import { AddressController } from "./address.controller";
import { AddressService } from "./address.service";
import { AuditService } from "./audit.service";
import { ProfileController } from "./profile.controller";
import { ProfileService } from "./profile.service";
import { StaffController } from "./staff.controller";
import { StaffService } from "./staff.service";

/**
 * Users module (profiles, staff management, address book).
 */
@Module({
  imports: [AuthModule, GeocodingModule],
  controllers: [ProfileController, AddressController, StaffController],
  providers: [ProfileService, AddressService, StaffService, AuditService],
  exports: [ProfileService, AddressService, StaffService],
})
export class UsersModule {}
