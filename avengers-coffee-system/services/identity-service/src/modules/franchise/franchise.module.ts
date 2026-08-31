import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FranchiseController } from './franchise.controller';
import { FranchiseService } from './franchise.service';
import { ComboNguyenLieu } from './entities/combo-nguyen-lieu.entity';
import { HoSoDangKy } from './entities/ho-so-dang-ky.entity';
import { Kiosk } from './entities/kiosk.entity';
import { HopDongNhuongQuyen } from './entities/hop-dong.entity';
import { DonMuaCombo } from './entities/don-mua-combo.entity';
import { CongNo } from './entities/cong-no.entity';
import { RoyaltyHangThang } from './entities/royalty.entity';
import { KetQuaDoiSoat } from './entities/doi-soat.entity';
import { BienBanViPham } from './entities/bien-ban-vi-pham.entity';
import { AuditLog } from './entities/audit-log.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ComboNguyenLieu,
      HoSoDangKy,
      Kiosk,
      HopDongNhuongQuyen,
      DonMuaCombo,
      CongNo,
      RoyaltyHangThang,
      KetQuaDoiSoat,
      BienBanViPham,
      AuditLog,
    ]),
  ],
  controllers: [FranchiseController],
  providers: [FranchiseService],
  exports: [FranchiseService],
})
export class FranchiseModule {}
