import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
} from "@nestjs/common";
import {
  ApiNoContentResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from "@nestjs/swagger";
import { UserRole } from "@greenroots/shared";
import {
  ApiAuth,
  ApiBadRequestResponseRfc9457,
  ApiCreatedResponseGeneric,
  ApiInternalServerErrorResponseRfc9457,
  ApiNotFoundResponseRfc9457,
  ApiOkResponseGeneric,
  ApiUnprocessableEntityResponseRfc9457,
  CurrentUser,
} from "@/common/decorators";
import { ZodValidationPipe } from "@/common/pipes/zod-validation.pipe";
import { zUuidV7 } from "@/common/schemas/zod-primitives";
import { apiSuccess, type ApiResponse } from "@/common/utils/api-response.util";
import { AddressService } from "./address.service";
import {
  AddressDto,
  CreateAddressDto,
  UpdateAddressDto,
  type Address,
  type UpdateAddressInput,
} from "./dto";
import { USERS_ROUTES } from "./users.routes";

/**
 * Self-service customer address book endpoints (`/api/v1/users/me/addresses`).
 */
@ApiTags(USERS_ROUTES.TAG)
@Controller({ path: USERS_ROUTES.BASE, version: "1" })
@ApiAuth(UserRole.CUSTOMER)
@ApiBadRequestResponseRfc9457()
@ApiInternalServerErrorResponseRfc9457()
export class AddressController {
  constructor(private readonly addressService: AddressService) {}

  @Get(USERS_ROUTES.ADDRESSES)
  @ApiOperation({
    summary: "List customer delivery addresses",
    description:
      "Returns up to 10 saved delivery addresses for the authenticated subject, ordered with the default address first.",
  })
  @ApiOkResponseGeneric(AddressDto, { isArray: true })
  async list(
    @CurrentUser("sub") userId: string,
  ): Promise<ApiResponse<Address[]>> {
    const addresses = await this.addressService.listAddresses(userId);
    return apiSuccess(addresses);
  }

  @Post(USERS_ROUTES.ADDRESSES)
  @ApiOperation({
    summary: "Create a customer delivery address",
    description:
      "Creates a saved delivery address using a validated HCMC districtCode and server-derived centroid coordinates.",
  })
  @ApiCreatedResponseGeneric(AddressDto)
  @ApiUnprocessableEntityResponseRfc9457()
  async create(
    @CurrentUser("sub") userId: string,
    @Body() dto: CreateAddressDto,
  ): Promise<ApiResponse<Address>> {
    const address = await this.addressService.createAddress(userId, dto);
    return apiSuccess(address);
  }

  @Patch(USERS_ROUTES.ADDRESS_BY_ID)
  @ApiOperation({
    summary: "Update a customer delivery address",
    description:
      "Updates contact or location fields on an owned address and recomputes cached coordinates when districtCode changes.",
  })
  @ApiParam({
    name: "id",
    type: "string",
    format: "uuid",
    description: "Address UUIDv7 identifier",
  })
  @ApiOkResponseGeneric(AddressDto)
  @ApiNotFoundResponseRfc9457()
  @ApiUnprocessableEntityResponseRfc9457()
  async update(
    @CurrentUser("sub") userId: string,
    @Param("id", new ZodValidationPipe(zUuidV7())) id: string,
    @Body() dto: UpdateAddressDto,
  ): Promise<ApiResponse<Address>> {
    const address = await this.addressService.updateAddress(
      userId,
      id,
      dto as UpdateAddressInput,
    );
    return apiSuccess(address);
  }

  @Patch(USERS_ROUTES.ADDRESS_DEFAULT)
  @ApiOperation({
    summary: "Set default delivery address",
    description:
      "Atomically switches the authenticated subject's default delivery address.",
  })
  @ApiParam({
    name: "id",
    type: "string",
    format: "uuid",
    description: "Address UUIDv7 identifier",
  })
  @ApiOkResponseGeneric(AddressDto)
  @ApiNotFoundResponseRfc9457()
  async setDefault(
    @CurrentUser("sub") userId: string,
    @Param("id", new ZodValidationPipe(zUuidV7())) id: string,
  ): Promise<ApiResponse<Address>> {
    const address = await this.addressService.setDefaultAddress(userId, id);
    return apiSuccess(address);
  }

  @Delete(USERS_ROUTES.ADDRESS_BY_ID)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: "Delete a customer delivery address",
    description:
      "Hard-deletes an owned address and promotes the most recently created remaining address when deleting the default.",
  })
  @ApiParam({
    name: "id",
    type: "string",
    format: "uuid",
    description: "Address UUIDv7 identifier",
  })
  @ApiNoContentResponse({ description: "Address deleted successfully" })
  @ApiNotFoundResponseRfc9457()
  async remove(
    @CurrentUser("sub") userId: string,
    @Param("id", new ZodValidationPipe(zUuidV7())) id: string,
  ): Promise<void> {
    await this.addressService.removeAddress(userId, id);
  }
}
