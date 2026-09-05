import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { type Transporter, createTransport } from 'nodemailer';

export interface Mail {
  to: string;
  subject: string;
  text: string;
}

/**
 * Email, if it has been configured (§37).
 *
 * Entirely optional. With no SMTP host the transport is never created and
 * `send` reports plainly that there is nowhere to send to — the application
 * runs the same either way, which is the rule for every integration here.
 *
 * Nothing sensitive goes in an email body. A notification says what needs
 * attention and where to look; the value itself stays behind the login (§43).
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transport: Transporter | null;
  private readonly from: string;

  constructor(config: ConfigService) {
    const host = config.get<string>('mail.host');
    this.from = config.get<string>('mail.from') ?? 'developer-os@localhost';

    if (!host) {
      this.transport = null;
      return;
    }

    const user = config.get<string>('mail.user') ?? '';
    this.transport = createTransport({
      host,
      port: config.get<number>('mail.port') ?? 587,
      secure: config.get<boolean>('mail.secure') ?? false,
      ...(user ? { auth: { user, pass: config.get<string>('mail.password') ?? '' } } : {}),
    });
    this.logger.log(`Email enabled via ${host}`);
  }

  get configured(): boolean {
    return this.transport !== null;
  }

  async send(mail: Mail): Promise<boolean> {
    if (!this.transport) return false;
    await this.transport.sendMail({ ...mail, from: this.from });
    return true;
  }

  /** Used by the settings screen to prove the configuration before relying on it. */
  async verify(): Promise<{ ok: boolean; detail: string }> {
    if (!this.transport) {
      return { ok: false, detail: 'No SMTP host configured. Set MAIL_HOST in .env.' };
    }
    try {
      await this.transport.verify();
      return { ok: true, detail: 'The mail server accepted the connection.' };
    } catch (caught) {
      // The host and port are already known to the user; the credentials are not
      // in the message because nodemailer sometimes echoes them.
      return {
        ok: false,
        detail: `The mail server refused the connection: ${(caught as Error).name}.`,
      };
    }
  }
}
