# APMS — Global Market Research (Software + Hardware)

> **Status:** Research backing for `CONTEXT.md` · **As of:** 2026-11-18  
> **Method:** Secondary web research (vendor pricing pages, OEM catalogs, regulator guides, market reports).  
> **Not:** Customer interviews or paid full-report access. Treat market-size figures as **directional**.  
> **SSOT for product decisions:** `CONTEXT.md` (this file does not override product CONFIRMED items).

---

## 1. Market size (directional)

| Scope | Figure (secondary) | Source class |
| :--- | :--- | :--- |
| Global time & attendance software | ~USD 3.37B (2024) → ~5.58B (2029) | ResearchAndMarkets summary |
| Of which biometric type segment | ~USD 1.19B (2024) | Same |
| Global biometric attendance software | ~USD 2.1B (2025) | QY Research summary |
| India time-attendance software | ~USD 229M (2025), CAGR ~11% | MarketResearchFuture summary |
| India fingerprint sensors | ~USD 111M (2025) | Grand View summary |
| Top-10 global T&A vendors share | ~25% combined (fragmented) | ResearchAndMarkets |

**Takeaway:** Fragmented market; India growing faster than global average; hardware + cloud software both required for factories.

---

## 2. India — software competitors (verified 2026 pricing signals)

| Vendor | Segment | Attendance + geo | India statutory payroll | Device sync | Guide price (ex-GST) |
| :--- | :--- | :--- | :--- | :--- | :--- |
| greytHR | SMB suite | Growth+; GPS live add-on ~₹140 PEPM | Yes | Via Astra / connectors | Essential ₹2,495/50 (no att.); Growth ₹4,495/50 +₹85 |
| HROne | Mid HCM | In Basic (geo/biometric) | Yes | eSSL, ZKTeco, Suprema, BIOMAX | Basic ₹4,950/50 +₹99 |
| Keka | Mid HCM | Basic→advanced by tier | Yes | 200+ devices claim | 100-seat floors ~₹7k–16k |
| factoHR | SMB | AI face in Core; geo Premium | Yes | DB/IP/SDK | Free ≤20; Core ₹4,999/50 |
| Pocket HRMS | SMB | Geo-tag Std; fence Pro; fraud Premium | Yes | Utility / import | Std ₹2,995/50 |
| Zoho People + Payroll | Ecosystem | Att. from Professional | Separate product | Plugin/API | People ~₹96 PEPM; Payroll separate |
| Darwinbox | Enterprise | Yes | Yes | Custom | Quote |
| Ankastra | Attendance-first | Face + devices | Pro only | eSSL/ZK/Matrix/Hik/Suprema | Basic ₹2,999/50; Growth ₹5,999; Pro ₹9,999 |
| VelHR | Factory att+pay | Yes | PF/ESI | eSSL/ZK live | Factory ₹2,499/50 +₹45 |
| OTOMATE | MSME | Unlimited machines | Business+ | Native multi-brand | Att ₹15; +pay ₹25; +access ₹35 PEPM |
| Navlakha | MSME | Biometric | PF/ESI | Yes | ₹20–45 PEPM |
| pagar karo | Field/MSME | Selfie+GPS; biometric Pro | ₹55 PEPM | Face kiosk Pro | Att ₹31; Pay ₹55; Pro ₹79 |
| Truein | Attendance | Face kiosk / GPS | No full statutory | Hardware-less | ~₹250–350/user/yr + base |
| PagarBook | Daily wage | App / Lens | Light | Limited | ~₹499–1,398 /staff/yr |
| AttendancePay | SMB | Selfie/GPS | Higher tiers | Biometric higher | ₹30–150 PEPM band |
| Timelabs | SMB–mid | Geo + face Rhythm+ | Yes | Devices pack | Pulse ~₹65 PEPM @50 |
| ZFour | SMB | GPS+fence all plans | Yes | Biometric sync | ₹50–100 PEPM |
| SalaryBox | Blue-collar | GPS; biometric buy | Business | Device in-app | Base + ~₹27–68 PEPM |
| AionHRMS | Att-first | Push eSSL/ZK/Realtime | Compute, limited filing | Direct push | ₹25k/yr ≤100 |

**India pattern:** Attendance gated behind mid tiers at payroll-first suites; attendance-first vendors undercut at ₹15–45 PEPM; full HCM floors bite SMEs under 50 seats.

---

## 3. India — hardware OEMs & street prices

| Brand | Origin / role | Typical India terminal ₹ (ex-GST) | Integration | Notes |
| :--- | :--- | :--- | :--- | :--- |
| eSSL | India volume leader (claims >60% T&A share) | X990 ~8–11k; AiFace Mars ~18–21k | ADMS / eTimeTrack / EasyTimePro | Deepest dealer/service network |
| ZKTeco | Global OEM, strong India | MB360 ~7.5–9k; SpeedFace V5L ~27k | ADMS push / TCP / ZKBio API | Face+palm multimodal |
| Realtime | India mid | T304 ~4.5–6.5k; T52F ~11–21k | Export / limited cloud | Price-sensitive factories |
| BioMax | India budget | Fingerprint ~3.8–7.5k | Desktop / partners | Entry shops |
| Matrix COSEC | India enterprise AC+TA | ARGO FACE ~17.6–69k | HTTP push / CENTRA API | Access + attendance |
| Hikvision MinMoe | CCTV ecosystem | DS-K1T341 ~10–16k | ISAPI | Sites already on Hik CCTV |
| Suprema | Korea premium | BioEntry W3 ~30–45k; BioStation 3 ~70–80k | BioStar 2 REST | High accuracy / multi-nat offices |
| Anviz / Realand / Identix | Niche | Varies | CSV / proprietary | Long-tail → file adapter |
| Mantra (AEBAS) | Gov STQC | ~13–20k | AEBAS | PSU/gov — not APMS default path |
| Tablet / phone kiosk | Soft hardware | Device cost only | Edge face + PIN/QR | Growing “no terminal” segment |

**CCTV-as-attendance (software overlays):** NexZig, BiometricAPI Stream Engine, MemoFaceAI, FaceTagr NBOX, Advantech FaceMatch — RTSP/ONVIF, edge match, events to HRMS. Validates APMS `adapter.cctv_frame` SPI.

---

## 4. Japan — software + hardware

| Software | Guide price | Punch modalities |
| :--- | :--- | :--- |
| KING OF TIME | ¥300/user/mo all-in | PC, GPS, IC, fingerprint, finger vein, iPad face |
| Jobcan 勤怠 | ¥200–500/user; ≤10 free | Web, GPS, IC, vein, LINE/Slack |
| Touch On Time | ¥300/user | Finger hybrid, IC, GPS |
| jinjer 勤怠 | ¥300+/user (min 10) | Biometric + suite expand |
| freee 勤怠 Plus | ¥300/user | Finger/vein |
| oziTime | Plans by seats | Face+liveness (phone/PC), palm vein, BLE beacon, IC |
| Xronos / Canon | Package / cloud | Face, finger/palm vein, IC, phone |

**Hardware culture:** Hitachi finger-vein (~¥37.5k PC reader), NEC finger-hybrid, IC transit cards still mainstream, iPad face kiosks common. **APPI:** biometrics as personal identifier codes; objective time records under Work Style Reform.

---

## 5. Korea — software + hardware

- Market mixes **access control + attendance**; face expected to dominate next 3 years (~42% survey expectation).
- **Suprema** (BioStation/BioEntry, BioStar 2, cloud subscription pivot); **Union Biometrics**; Silicon Bridge mobile access.
- **PIPA:** biometric identifiers = sensitive; separate consent; prefer on-device; card/PIN alternative required in practice.
- Access-control market CAGR ~7% to 2031 (Mordor summary).

---

## 6. China — software + hardware

| Layer | Players |
| :--- | :--- |
| Collab suites | DingTalk (Alibaba), Feishu/Lark (ByteDance), WeCom — GPS/Wi-Fi/face clock-in |
| Factory-focused | Clockgogo and specialists (anti-fraud, multi-site) |
| Hardware | Hikvision MinMoe, Dahua, ZKTeco, local face terminals |
| Law | PIPL + Facial Recognition Measures (effective Jun 2025): separate consent, non-face alternative, minimize store/transmit |

---

## 7. SEA + GCC

| Country | Software | Notes |
| :--- | :--- | :--- |
| Singapore | StaffAny, QuickHR, brioHR, HReasily | F&B roster + face/QR/Wi-Fi; CPF compliance separate |
| Malaysia | Swingvy, Kakitangan, PayrollPanda+Jibble, brioHR | From ~RM3–10 PEPM; EPF/SOCSO |
| UAE/GCC | Bayzat | WPS payroll + biometric/face/liveness + geo |

---

## 8. US / EU (reference only — not APMS MVP)

| Vendor | Region | T&A posture | Pricing posture |
| :--- | :--- | :--- | :--- |
| UKG (Kronos) | Global ent. | Deep WFM + clocks | Quote; Ready Start &lt;200 emp |
| ADP | Global | Workforce Now T&A | Quote / Premium packs |
| Paycom | US | Single DB + terminals | Quote |
| BambooHR | US SMB | T&A add-on / kiosk | Core ~$10 PEPM |
| Factorial | EU/US SMB | Geo, QR, clocks | From ~$8 PEPM |
| Personio | EU mid | Time, geo, entrance app | Quote |
| Jibble | Global att. | Face/GPS/kiosk | Free→paid; no India statutory |

Workday / SAP SF: enterprise HCM; India payroll often via local partners — not a direct APMS SMB competitor.

---

## 9. Cross-region pricing bands (software, PEPM approx.)

| Band | India (INR) | Japan (JPY) | MY/SG | US/EU (USD) |
| :--- | :--- | :--- | :--- | :--- |
| Attendance-only floor | 15–35 | 200–300 | RM3–10 / S$5 | Free–8 |
| Att + local payroll | 25–80 | Suite add-on | RM10+ | 10–25+ |
| Full HCM mid | 80–150+ | Suite | Quote | 17–25+ |
| Enterprise WFM | Quote | Quote | Quote | Quote / $80–150+ |

---

## 10. India vertical WTP (inferred from list prices + segment fit)

No published WTP survey found. Inference from vendors targeting each vertical:

| Vertical | Pain density | Observed price comfort | Likely WTP for APMS-fit pack | Hardware attach |
| :--- | :--- | :--- | :--- | :--- |
| Manufacturing MSME | High (OT, night, contract) | OTOMATE/VelHR/Ankastra ₹25–80 PEPM or ₹2.5–6k base/50 | **₹35–70 PEPM** Workforce | 1–N terminals; Edge Agent critical |
| Mid factory / multi-plant | High | HROne/facto/Keka floors | **₹70–110 PEPM** or plant base | Multi-brand adapters |
| Healthcare private | High rules, uncertain duty length | Mid suites | **₹60–100 PEPM** if duty engine proven | Face preferred (hygiene) |
| Retail / F&B multi-branch | Medium–high attrition | StaffAny-class + Indian SMB | **₹40–75 PEPM** | Kiosk/face + geo |
| Security / FM | High multi-site | Field Pro tiers ₹79+ | **₹70–120 PEPM** + per-site | Mobile L2–L3; RFID |
| Education | Medium; student volume discount | Volume PEPM discount | **₹25–50 student; ₹50–80 staff** | Classroom CCTV optional |
| IT / hybrid | Low attendance complexity | greytHR Essential→Growth | **₹40–70 PEPM** if payroll bundled | Mobile geo > terminals |

**WTP risk:** Pure PEPM ≥₹79 without night-shift/OT proof loses MSME factories to ₹15–45 vendors. **WTP upside:** Explainable attendance→payroll + multi-OEM adapters + offline Edge justifies premium vs Truein/OTOMATE.

---

## 11. Legal & biometric compliance digest

### India
| Topic | Current reading (counsel required) | APMS product rule |
| :--- | :--- | :--- |
| DPDP Act 2023 | Personal data includes biometrics; **no SPDI-style sensitive tier** in DPDP; employment processing may use s.7(i); notice + safeguards still mandatory | Notice + purpose limit + retention; template-on-device; delete templates on exit |
| SPDI Rules 2011 | Written consent for biometrics until DPDP commencement (~May 2027 per advisory) | Keep **explicit biometric consent ledger** through transition |
| Alternate modality | Proportionality / best practice; China/Korea require alternatives | **Mandatory** card/PIN/app path |
| Aadhaar | Not an attendance credential | Forbidden as punch key |
| OSH Code 2020 | In force **21 Nov 2025**; OT ≥ **2×** normal wage (s.27); electronic muster/OT registers; retain **5 years** | Parameterized OT; electronic Form-compatible registers |
| Factories Act OT lore | Largely superseded by Codes — do not hardcode old quarterly caps without state rules | State pack tables; OPEN for state OT caps |

### APAC (product localization later)
| Region | Key rule | APMS default |
| :--- | :--- | :--- |
| Japan APPI | Personal identifier codes; objective records | Events-only cloud; IC alternate |
| China FR Measures 2025 | Separate consent; non-face alternative; minimize store/transmit | Same SPI; no sole-face |
| Korea PIPA | Sensitive biometric; separate consent; on-device preferred | Consent + edge |
| Singapore PDPC | Employment exception possible; consent recommended | Consent UX |

---

## 12. Implications for APMS (fed into CONTEXT)

1. Ship **multi-OEM adapters** (eSSL, ZKTeco, Matrix, Hikvision, Suprema, CSV) — table stakes in India.  
2. Price **Capture** to fight ₹15–45 MSME floor without race-to-bottom.  
3. Put complex shifts + explainable payroll in **Workforce** (competitor upsell gap).  
4. CCTV adapter is real category (NexZig et al.) — Phase 6 / Command.  
5. Compliance UX: notice, consent ledger, alternate punch, template deletion, 5-year electronic registers.  
6. Japan/Korea vein/iris = P3 adapter; not MVP.

---

## 13. Open research actions

1. Interview 5 factory + 5 hospital payroll admins (WTP validation).  
2. Counsel memo: DPDP s.7(i) vs consent for biometrics; state OT caps under Codes.  
3. Live scrape refresh of greytHR/Keka/HROne quarterly.  
4. Hardware partner MoUs (eSSL / ZKTeco channel).
