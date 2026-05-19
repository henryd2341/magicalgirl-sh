/* eslint-disable no-unused-vars */

import type { DomainCommand } from "@/types/commands";

export type DomainCommandHandler = (command: DomainCommand) => void;

export class CommandBus {
  private readonly handler: DomainCommandHandler;

  public constructor(handler: DomainCommandHandler) {
    this.handler = handler;
  }

  public dispatch(command: DomainCommand): void {
    this.handler(command);
  }
}
