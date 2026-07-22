import { Column, Entity, PrimaryColumn } from 'typeorm';

const userSchema = process.env.DB_SCHEMA || 'identity';

@Entity({ name: 'membership_config', schema: userSchema })
export class MembershipConfig {
  @PrimaryColumn({ type: 'varchar' })
  key: string;

  @Column({ type: 'json' })
  value: any;
}
