import type { ApiKeyPrincipal } from "@/lib/api-key-auth";
import { AudienceError } from "@/lib/audience-core";
import type { AudienceHttpServices } from "@/lib/audience-http";
import {
  createAudience,
  createContact,
  deleteAudience,
  deleteContact,
  getAudience,
  getContact,
  importContacts,
  listAudiences,
  listContacts,
  updateAudience,
  updateContact,
} from "@/lib/audiences";

function actorUserId(principal: ApiKeyPrincipal): string {
  if (!principal.actorUserId) throw new AudienceError("MEMBERSHIP_REQUIRED");
  return principal.actorUserId;
}

function base(principal: ApiKeyPrincipal) {
  return { actorUserId: actorUserId(principal), orgId: principal.orgId };
}

export const audienceApiServices: AudienceHttpServices = {
  createAudience: (principal, payload) => createAudience({ ...base(principal), payload }),
  createContact: (principal, audienceId, payload) => createContact({ ...base(principal), audienceId, payload }),
  deleteAudience: (principal, audienceId) => deleteAudience({ ...base(principal), audienceId }),
  deleteContact: (principal, audienceId, contactId) => deleteContact({ ...base(principal), audienceId, contactId }),
  getAudience: (principal, audienceId) => getAudience({ ...base(principal), audienceId }),
  getContact: (principal, audienceId, contactId) => getContact({ ...base(principal), audienceId, contactId }),
  importContacts: (principal, audienceId, csv) => importContacts({ ...base(principal), audienceId, csv }),
  listAudiences: (principal) => listAudiences(base(principal)),
  listContacts: (principal, audienceId) => listContacts({ ...base(principal), audienceId }),
  updateAudience: (principal, audienceId, payload) => updateAudience({ ...base(principal), audienceId, payload }),
  updateContact: (principal, audienceId, contactId, payload) => updateContact({ ...base(principal), audienceId, contactId, payload }),
};
