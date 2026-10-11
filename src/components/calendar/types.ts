import type { BreakTreatment, ShiftStatus } from "@/db/schema";
import type { ShiftRow } from "@/lib/queries";
import type { CalendarView } from "@/lib/time";

export type CalShift = ShiftRow;
export type CalSite = { id: string; name: string; zone: string };
export type CalArea = { id: string; name: string; color: string; siteId: string };
export type CalPerson = {
  id: string;
  fullName: string;
  siteId: string | null;
  areaId: string | null;
  positionId: string | null;
  positionName: string | null;
  isContractor: boolean;
};
export type CalPosition = { id: string; name: string };
export type CalTemplate = {
  id: string;
  name: string;
  code: string;
  startTime: string;
  durationMinutes: number;
  breakMinutes: number;
  breakTreatment: BreakTreatment;
  areaId: string | null;
  positionId: string | null;
};

export type ShiftDraft = {
  id: string | null;
  version: number | null;
  status: ShiftStatus;
  updatedBy: string | null;
  siteId: string;
  areaId: string;
  personId: string;
  positionId: string;
  templateId: string;
  date: string;
  startTime: string;
  endTime: string;
  breakMinutes: number;
  breakTreatment: BreakTreatment;
  notes: string;
};

export type CalendarData = {
  view: CalendarView;
  anchor: string;
  today: string;
  zone: string;
  siteId: string | null;
  sites: CalSite[];
  areas: CalArea[];
  people: CalPerson[];
  positions: CalPosition[];
  templates: CalTemplate[];
  shifts: CalShift[];
  perms: { edit: boolean; approve: boolean; publish: boolean };
  userId: string;
  separationOfDuties: boolean;
};

export type CreateSeed = { date: string; startTime?: string; personId?: string };
