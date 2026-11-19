import { Module } from "@nestjs/common";
import { AddressController } from "./address.controller";
import { AddressService } from "./address.service";
import { ProfileController } from "./profile.controller";
import { ProfileService } from "./profile.service";

/**
 * Users module (profiles, staff management, address book).
 */
@Module({
  controllers: [ProfileController, AddressController],
  providers: [ProfileService, AddressService],
  exports: [ProfileService, AddressService],
})
export class UsersModule {}
