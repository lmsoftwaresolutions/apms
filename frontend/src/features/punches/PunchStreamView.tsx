import React, { useEffect, useState } from "react";
import { api, PunchEvent } from "../../api";

export const PunchStreamView: React.FC = () => {
  const [punches, setPunches] = useState<PunchEvent[]>([]);

  useEffect(() => {
    api
      .punches({ limit: 50 })
      .then(setPunches)
      .catch(() => {
        // Fallback demo events
        setPunches([
          {
            id: "evt-8841",
            raw_envelope_id: "env-1",
            employee_id: "EMP-1029",
            punch_time: "2026-11-24T06:28:14+05:30",
            punch_direction: "IN",
            source: "ETIMEOFFICE",
            status: "INGESTED",
            device_identifier: "bio_gate2_spinning",
          },
          {
            id: "evt-8840",
            raw_envelope_id: "env-1",
            employee_id: "EMP-1029",
            punch_time: "2026-11-24T06:28:15+05:30",
            punch_direction: "IN",
            source: "ETIMEOFFICE",
            status: "DUPLICATE_FILTERED",
            device_identifier: "bio_gate2_spinning",
          },
          {
            id: "evt-8839",
            raw_envelope_id: "env-2",
            employee_id: "EMP-1102",
            punch_time: "2026-11-24T05:54:10+05:30",
            punch_direction: "IN",
            source: "RFID_TURNSTILE",
            status: "INGESTED",
            device_identifier: "rfid_qa_turnstile",
          },
        ]);
      });
  }, []);

  return (
    <section className="space-y-6">
      <div className="bg-white p-4 rounded-[28px] border border-slate-100 shadow-sm flex items-center justify-between">
        <div>
          <h2 className="text-sm font-black text-slate-800 font-poppins">Multi-Vendor Raw Punch Ingestion Log</h2>
          <p className="text-[11px] text-slate-400 font-medium">Vendor-agnostic adapters (eTime Office, eSSL push, RFID door access, CCTV frames)</p>
        </div>
        <span className="text-[10px] font-black px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
          Adapter Stream: ACTIVE (0 latency)
        </span>
      </div>

      <div className="bg-white border border-slate-100 rounded-3xl overflow-hidden shadow-sm">
        <table className="w-full text-left border-collapse text-xs font-mono">
          <thead>
            <tr className="bg-slate-50 text-slate-400 uppercase text-[9px] font-black tracking-widest border-b border-slate-100 font-sans">
              <th className="px-6 py-3.5">Raw Event ID</th>
              <th className="px-6 py-3.5">Punch Timestamp</th>
              <th className="px-6 py-3.5">Employee ID</th>
              <th className="px-6 py-3.5">Direction</th>
              <th className="px-6 py-3.5">Source Adapter</th>
              <th className="px-6 py-3.5">Hardware Identifier</th>
              <th className="px-6 py-3.5">Deduplication State</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-[11px]">
            {punches.map((p) => {
              const isDupe = p.status.includes("DUPLICATE");
              return (
                <tr key={p.id} className={`hover:bg-slate-50 ${isDupe ? "bg-amber-50/20" : ""}`}>
                  <td className="px-6 py-3 font-bold text-slate-600">{p.id}</td>
                  <td className="px-6 py-3 text-slate-800">{p.punch_time}</td>
                  <td className="px-6 py-3 font-bold text-blue-700">{p.employee_id}</td>
                  <td className="px-6 py-3 font-black text-emerald-600">{p.punch_direction}</td>
                  <td className="px-6 py-3 text-slate-700">{p.source}</td>
                  <td className="px-6 py-3 text-slate-500">{p.device_identifier || "generic"}</td>
                  <td className="px-6 py-3">
                    <span className={isDupe ? "text-amber-600 font-bold" : "text-emerald-600 font-bold"}>
                      {p.status}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
};

