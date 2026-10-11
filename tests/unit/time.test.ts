import { describe, expect, it } from "vitest";
import {
  crossesMidnight,
  daysForView,
  durationMinutes,
  instantToLocal,
  isIsoDate,
  isTime,
  localToInstant,
  rangeForView,
  shiftAnchor,
  shiftFromStart,
  shiftFromTimes,
  splitByLocalDay,
  startOfWeek,
} from "@/lib/time";

const BOG = "America/Bogota";
const NYC = "America/New_York";

describe("conversión entre hora local e instante", () => {
  it("Bogotá está a UTC-5 todo el año", () => {
    expect(localToInstant("2026-10-11", "06:00", BOG).toISOString()).toBe("2026-10-11T11:00:00.000Z");
    expect(localToInstant("2026-01-15", "06:00", BOG).toISOString()).toBe("2026-01-15T11:00:00.000Z");
  });

  it("ida y vuelta conserva fecha y hora locales", () => {
    const instant = localToInstant("2026-10-11", "22:30", BOG);
    expect(instantToLocal(instant, BOG)).toEqual({ date: "2026-10-11", time: "22:30" });
  });

  it("un mismo instante cae en días distintos según la zona", () => {
    const instant = localToInstant("2026-10-11", "23:00", BOG);
    expect(instantToLocal(instant, "Europe/Madrid").date).toBe("2026-10-12");
  });

  it("rechaza fechas y horas inválidas", () => {
    expect(isIsoDate("2026-02-30")).toBe(false);
    expect(isIsoDate("2026-2-3")).toBe(false);
    expect(isIsoDate("2026-02-28")).toBe(true);
    expect(isTime("24:00")).toBe(false);
    expect(isTime("7:00")).toBe(false);
    expect(isTime("07:00")).toBe(true);
    expect(isTime("22:00:00")).toBe(true);
    expect(() => localToInstant("2026-13-01", "06:00", BOG)).toThrow();
  });
});

describe("turnos que cruzan la medianoche", () => {
  it("fin menor que inicio significa día siguiente", () => {
    const shift = shiftFromTimes("2026-10-11", "22:00", "06:00", BOG);
    expect(shift.endsNextDay).toBe(true);
    expect(durationMinutes(shift.startsAt, shift.endsAt)).toBe(480);
    expect(instantToLocal(shift.endsAt, BOG)).toEqual({ date: "2026-10-12", time: "06:00" });
    expect(crossesMidnight(shift.startsAt, shift.endsAt, BOG)).toBe(true);
  });

  it("fin igual al inicio es un turno de 24 horas", () => {
    const shift = shiftFromTimes("2026-10-11", "06:00", "06:00", BOG);
    expect(durationMinutes(shift.startsAt, shift.endsAt)).toBe(1440);
  });

  it("un turno diurno no cruza la medianoche", () => {
    const shift = shiftFromTimes("2026-10-11", "06:00", "14:00", BOG);
    expect(shift.endsNextDay).toBe(false);
    expect(crossesMidnight(shift.startsAt, shift.endsAt, BOG)).toBe(false);
  });

  it("terminar exactamente a las 00:00 no ocupa el día siguiente", () => {
    const shift = shiftFromTimes("2026-10-11", "16:00", "00:00", BOG);
    expect(durationMinutes(shift.startsAt, shift.endsAt)).toBe(480);
    expect(crossesMidnight(shift.startsAt, shift.endsAt, BOG)).toBe(false);
    expect(splitByLocalDay(shift.startsAt, shift.endsAt, BOG)).toHaveLength(1);
  });

  it("divide el turno nocturno en un tramo por día", () => {
    const shift = shiftFromStart("2026-10-11", "22:00", 480, BOG);
    expect(splitByLocalDay(shift.startsAt, shift.endsAt, BOG)).toEqual([
      { date: "2026-10-11", startMinute: 1320, endMinute: 1440, isStart: true, isEnd: false },
      { date: "2026-10-12", startMinute: 0, endMinute: 360, isStart: false, isEnd: true },
    ]);
  });

  it("valida la duración al crear desde plantilla", () => {
    expect(() => shiftFromStart("2026-10-11", "22:00", 0, BOG)).toThrow();
    expect(() => shiftFromStart("2026-10-11", "22:00", 1441, BOG)).toThrow();
    expect(() => shiftFromStart("2026-10-11", "22:00", 7.5, BOG)).toThrow();
  });
});

describe("cambios de horario (DST) en zonas que los tienen", () => {
  // En Nueva York, el 1 de noviembre de 2026 a las 02:00 el reloj vuelve a la 01:00.
  it("la duración de plantilla es tiempo real transcurrido", () => {
    const shift = shiftFromStart("2026-10-31", "22:00", 480, NYC);
    expect(durationMinutes(shift.startsAt, shift.endsAt)).toBe(480);
    // Ocho horas reales después de las 22:00 son las 05:00 locales, no las 06:00.
    expect(instantToLocal(shift.endsAt, NYC)).toEqual({ date: "2026-11-01", time: "05:00" });
  });

  it("con horas de reloj fijas, la noche del cambio dura una hora más", () => {
    const shift = shiftFromTimes("2026-10-31", "22:00", "06:00", NYC);
    expect(durationMinutes(shift.startsAt, shift.endsAt)).toBe(540);
  });
});

describe("rangos de las vistas del calendario", () => {
  it("la semana empieza el lunes", () => {
    expect(startOfWeek("2026-10-11")).toBe("2026-10-05"); // domingo
    expect(startOfWeek("2026-10-05")).toBe("2026-10-05"); // lunes
    expect(daysForView("semana", "2026-10-11")).toEqual([
      "2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09", "2026-10-10", "2026-10-11",
    ]);
  });

  it("el mes muestra semanas completas", () => {
    const days = daysForView("mes", "2026-10-15");
    expect(days[0]).toBe("2026-09-28");
    expect(days[days.length - 1]).toBe("2026-11-01");
    expect(days.length % 7).toBe(0);
  });

  it("el rango de un día va de medianoche a medianoche local", () => {
    const range = rangeForView("dia", "2026-10-11", BOG);
    expect(range.from.toISOString()).toBe("2026-10-11T05:00:00.000Z");
    expect(range.to.toISOString()).toBe("2026-10-12T05:00:00.000Z");
  });

  it("navega por día, semana y mes", () => {
    expect(shiftAnchor("dia", "2026-10-31", 1)).toBe("2026-11-01");
    expect(shiftAnchor("semana", "2026-10-11", -1)).toBe("2026-10-04");
    expect(shiftAnchor("mes", "2026-01-31", 1)).toBe("2026-02-01");
    expect(shiftAnchor("equipo", "2026-10-11", 1)).toBe("2026-10-18");
  });
});
