import { db } from './database.ts';
import { v4 as uuidv4 } from 'uuid';

interface HyderabadHospitalSeed {
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  phone: string;
}

const HYDERABAD_HOSPITALS: HyderabadHospitalSeed[] = [
  { name: 'Apollo Hospitals, Jubilee Hills', address: 'Road No. 72, Film Nagar, Jubilee Hills, Hyderabad', latitude: 17.4156, longitude: 78.4126, phone: '+91 40 2360 7777' },
  { name: 'KIMS Hospitals, Secunderabad', address: '1-8-31/1, Minister Rd, Krishna Nagar, Secunderabad', latitude: 17.4368, longitude: 78.4847, phone: '+91 40 4488 5000' },
  { name: 'Yashoda Hospitals, Somajiguda', address: 'Raj Bhavan Rd, Somajiguda, Hyderabad', latitude: 17.4241, longitude: 78.4583, phone: '+91 40 4567 4567' },
  { name: "NIMS (Nizam's Institute of Medical Sciences)", address: 'Panjagutta Main Rd, Punjagutta, Hyderabad', latitude: 17.4216, longitude: 78.4519, phone: '+91 40 2348 9000' },
  { name: 'CARE Hospitals, Banjara Hills', address: 'Road No. 1, Banjara Hills, Hyderabad', latitude: 17.4126, longitude: 78.4494, phone: '+91 40 6165 6565' },
  { name: 'AIG Hospitals, Gachibowli', address: '1-66/AIG/2, Mindspace Rd, Gachibowli, Hyderabad', latitude: 17.4426, longitude: 78.3665, phone: '+91 40 4244 4222' },
  { name: 'Continental Hospitals, Nanakramguda', address: 'Plot No. 3, Road No. 2, Financial District, Hyderabad', latitude: 17.4176, longitude: 78.3396, phone: '+91 40 6700 0000' },
  { name: 'Osmania General Hospital', address: 'Afzal Gunj, Begum Bazar, Hyderabad', latitude: 17.3752, longitude: 78.4748, phone: '+91 40 2460 0146' },
  { name: 'Gandhi Hospital, Musheerabad', address: 'Padmarao Nagar, Musheerabad, Secunderabad', latitude: 17.4239, longitude: 78.5045, phone: '+91 40 2750 5566' },
  { name: 'Star Hospitals, Banjara Hills', address: 'Road No. 10, Banjara Hills, Hyderabad', latitude: 17.4179, longitude: 78.4418, phone: '+91 40 4477 7000' },
  { name: 'Yashoda Hospitals, Malakpet', address: 'Nalgonda X Roads, Malakpet, Hyderabad', latitude: 17.3736, longitude: 78.5032, phone: '+91 40 4567 4500' },
  { name: 'Yashoda Hospitals, Secunderabad', address: 'Alexander Rd, Kummari Guda, Secunderabad', latitude: 17.4408, longitude: 78.4979, phone: '+91 40 4567 4510' },
  { name: 'Apollo Hospitals, Hyderguda', address: '3-5-836, Old MLA Quarters Rd, Hyderguda, Hyderabad', latitude: 17.4004, longitude: 78.4820, phone: '+91 40 2323 1380' },
  { name: 'Apollo DRDO Hospital, Kanchanbagh', address: 'DMRL X Road, Santosh Nagar, Kanchanbagh, Hyderabad', latitude: 17.3389, longitude: 78.5105, phone: '+91 40 2434 2222' },
  { name: 'Medicover Hospitals, HITEC City', address: 'HUDA Techno Enclave, Madhapur, Hyderabad', latitude: 17.4447, longitude: 78.3812, phone: '+91 40 6833 4455' },
  { name: 'KIMS-Sunshine Hospitals, Begumpet', address: 'PG Road, Sindhi Colony, Begumpet, Secunderabad', latitude: 17.4414, longitude: 78.4631, phone: '+91 40 4455 0000' },
  { name: "Rainbow Children's & Perinatal Care, Banjara Hills", address: 'Road No. 2, Near LV Prasad Eye Inst., Banjara Hills', latitude: 17.4139, longitude: 78.4402, phone: '+91 40 4927 8999' },
  { name: 'CARE Hospitals, HITEC City', address: 'Old Mumbai Hwy, Jayabheri Pine Valley, Raidurgam', latitude: 17.4391, longitude: 78.3826, phone: '+91 40 6165 6500' },
  { name: 'CARE Hospitals, Nampally', address: 'Exhibition Grounds Rd, Nampally, Hyderabad', latitude: 17.3887, longitude: 78.4675, phone: '+91 40 3041 7777' },
  { name: 'Basavatarakam Indo American Hospital', address: 'Road No. 10, Banjara Hills, Hyderabad', latitude: 17.4184, longitude: 78.4264, phone: '+91 40 2355 1235' },
  { name: 'Virinchi Hospitals, Banjara Hills', address: 'Sy No. 121, Road No. 1, Banjara Hills, Hyderabad', latitude: 17.4109, longitude: 78.4452, phone: '+91 40 4699 9999' },
  { name: 'PACE Hospitals, Madhapur', address: 'Plot No. 23, Hitech City Rd, Madhapur, Hyderabad', latitude: 17.4452, longitude: 78.3892, phone: '+91 40 4848 6868' },
  { name: 'KIMS Hospitals, Kondapur', address: '1-112/86, Gachibowli-Miyapur Rd, Kondapur, Hyderabad', latitude: 17.4601, longitude: 78.3669, phone: '+91 40 6750 5050' },
  { name: 'SLG Hospitals, Bachupally', address: 'Nizampet-Bachupally Rd, Bachupally, Hyderabad', latitude: 17.5426, longitude: 78.3792, phone: '+91 40 6844 6844' },
  { name: 'Citizens Specialty Hospital, Nallagandla', address: '1-100/1/CCH, Serilingampally, Nallagandla, Hyderabad', latitude: 17.4664, longitude: 78.3137, phone: '+91 40 6719 1919' },
  { name: 'Remedy Hospitals, Kukatpally', address: 'Road No. 4, KPHB Colony, Kukatpally, Hyderabad', latitude: 17.4892, longitude: 78.4046, phone: '+91 40 2315 6789' },
  { name: 'OMNI Hospitals, Kothapet', address: 'Kothapet X Roads, Dilsukhnagar, Hyderabad', latitude: 17.3728, longitude: 78.5446, phone: '+91 40 6736 9999' },
  { name: 'Kamineni Hospitals, LB Nagar', address: 'Inner Ring Rd, Suryodaya Colony, LB Nagar, Hyderabad', latitude: 17.3492, longitude: 78.5528, phone: '+91 40 3987 9999' },
  { name: 'Aware Gleneagles Global Hospital, LB Nagar', address: '08-16-1, Bairamalguda, Sagar Rd, LB Nagar, Hyderabad', latitude: 17.3446, longitude: 78.5453, phone: '+91 40 2411 1111' },
  { name: 'Gleneagles Hospital, Lakdikapul', address: '6-1-1070/1-4, Lakdikapul, Hyderabad', latitude: 17.4033, longitude: 78.4616, phone: '+91 40 2349 1000' },
  { name: 'Aster Prime Hospital, Ameerpet', address: 'Plot No. 2 & 4, Satyam Theatre Rd, Ameerpet, Hyderabad', latitude: 17.4375, longitude: 78.4449, phone: '+91 40 4959 4959' },
  { name: 'Malla Reddy Narayana Multispeciality, Suraram', address: '1-1-216, Suraram X Roads, Jeedimetla, Hyderabad', latitude: 17.5471, longitude: 78.4314, phone: '+91 40 2215 2215' },
  { name: 'Olive Hospitals, Mehdipatnam', address: '12-2-718/3/5, Nanal Nagar X Rd, Mehdipatnam, Hyderabad', latitude: 17.3924, longitude: 78.4342, phone: '+91 40 3011 8888' },
  { name: 'Premier Hospital, Tolichowki', address: '12-2-718/A, Mehdipatnam-Tolichowki Rd, Hyderabad', latitude: 17.3974, longitude: 78.4129, phone: '+91 40 2351 5555' },
  { name: 'Prasad Hospital, Nacharam', address: '4-58/1, Nacharam Main Rd, Mallapur, Hyderabad', latitude: 17.4282, longitude: 78.5567, phone: '+91 40 2715 7777' },
  { name: 'Spark Hospital, Peerzadiguda', address: 'Warangal Hwy, Peerzadiguda, Uppal, Hyderabad', latitude: 17.4018, longitude: 78.5872, phone: '+91 40 2720 4455' },
  { name: 'Matrix Hospital, Ramanthapur', address: '3-13-141, Ramanthapur Main Rd, Hyderabad', latitude: 17.3926, longitude: 78.5327, phone: '+91 40 2703 8899' },
  { name: 'Poulomi Hospital, AS Rao Nagar', address: 'Plot 14, Dr. AS Rao Nagar, Sainikpuri, Secunderabad', latitude: 17.4792, longitude: 78.5608, phone: '+91 40 2714 3737' },
  { name: 'Russh Super Speciality Hospital, Suchitra', address: 'NH-44, Suchitra Circle, Kompally, Hyderabad', latitude: 17.5152, longitude: 78.4785, phone: '+91 40 4850 4850' },
  { name: 'Pranaam Hospital, Madinaguda', address: '1-62/1, Mumbai Hwy, Madinaguda, Miyapur, Hyderabad', latitude: 17.4936, longitude: 78.3408, phone: '+91 40 2304 5678' },
  { name: 'Zoi Hospitals, Attapur', address: 'Pillar No. 145, PVNR Expy, Attapur, Hyderabad', latitude: 17.3672, longitude: 78.4278, phone: '+91 40 4720 1234' },
  { name: 'Trident Hospital, Shamshabad', address: 'Airport Approach Rd, Shamshabad, Hyderabad', latitude: 17.2608, longitude: 78.3964, phone: '+91 40 2400 3636' },
];

export function seedDatabaseIfEmpty(): void {
  // Ensure 40+ Hyderabad-bounded hospitals AND realistic full-capacity nodes exist
  const hyderabadCount = (
    db
      .prepare('SELECT COUNT(*) as c FROM Hospitals WHERE latitude BETWEEN 17.0 AND 18.0 AND longitude BETWEEN 78.0 AND 79.0')
      .get() as { c: number }
  ).c;
  const fullCapacityHospitals = (
    db
      .prepare(`
        SELECT COUNT(*) as c FROM (
          SELECT hospital_id, SUM(CASE WHEN status = 'AVAILABLE' THEN 1 ELSE 0 END) as avail
          FROM Beds
          GROUP BY hospital_id
          HAVING avail = 0
        )
      `)
      .get() as { c: number }
  ).c;
  if (hyderabadCount >= 40 && fullCapacityHospitals >= 3) {
    return;
  }

  const now = new Date();
  const iso = (offsetMinutes = 0) => new Date(now.getTime() + offsetMinutes * 60_000).toISOString();

  const insertAll = db.transaction(() => {
    db.exec(`
      DELETE FROM AuditLogs;
      DELETE FROM OutboxEvents;
      DELETE FROM ProcessedEvents;
      DELETE FROM Events;
      DELETE FROM TransferRequests;
      DELETE FROM BedReservations;
      DELETE FROM EmergencyRequests;
      DELETE FROM Ambulances;
      DELETE FROM Patients;
      DELETE FROM Beds;
      DELETE FROM Hospitals;
      DELETE FROM Users;
    `);

    // 1. Seed Users (3 roles)
    const insertUser = db.prepare(`
      INSERT INTO Users (id, email, password_hash, name, role, hospital_id, ambulance_id)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    insertUser.run('usr-ctrl-1', 'control@medigrid.org', 'demo123', 'Dr. Ananya Reddy', 'CONTROL_ROOM', null, null);
    insertUser.run('usr-hosp-1', 'staff@apollohyd.medigrid.org', 'demo123', 'Dr. Karthik Rao', 'HOSPITAL_STAFF', 'HOSP-01', null);
    insertUser.run('usr-hosp-2', 'staff@kimshyd.medigrid.org', 'demo123', 'Sister Padma Lakshmi', 'HOSPITAL_STAFF', 'HOSP-02', null);
    insertUser.run('usr-amb-1', 'dispatch04@medigrid.org', 'demo123', 'Vikram Goud (108 EMRI)', 'AMBULANCE_DISPATCHER', null, 'AMB-104');

    // 2. Seed 42 Hyderabad Hospitals + 4,284 Individual Beds
    const insertHospital = db.prepare(`
      INSERT INTO Hospitals (id, name, code, address, latitude, longitude, phone, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertBed = db.prepare(`
      INSERT INTO Beds (id, hospital_id, bed_type, status, patient_id, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    const noIcuSet = new Set([7, 10, 13, 18, 23, 28, 31, 35]);
    const noVentSet = new Set([10, 13, 23, 31, 35]);
    const noGenSet = new Set([10, 23, 31, 35]);

    for (let i = 0; i < HYDERABAD_HOSPITALS.length; i++) {
      const h = HYDERABAD_HOSPITALS[i];
      const num = String(i + 1).padStart(2, '0');
      const hid = `HOSP-${num}`;
      const code = `HYD-${num}`;
      const status = noGenSet.has(i) || i % 9 === 2 ? 'SURGE' : 'OPERATIONAL';

      insertHospital.run(hid, h.name, code, h.address, h.latitude, h.longitude, h.phone, status);

      // 42 * 102 = 4,284 individual beds (> 4,000 requirement): 16 ICU, 14 VENTILATOR, 72 GENERAL
      // HOSP-03 (Yashoda Hospitals, Somajiguda) keeps strictly 1 AVAILABLE ICU bed for Last-Bed Race test
      const icuCount = 16;
      const ventCount = 14;
      const genCount = 72;

      for (let b = 1; b <= icuCount; b++) {
        const bedId = `BED-${num}-ICU-${String(b).padStart(3, '0')}`;
        let bStatus: 'AVAILABLE' | 'OCCUPIED' | 'RESERVED' = 'OCCUPIED';
        if (i === 2) {
          bStatus = b === 1 ? 'AVAILABLE' : 'OCCUPIED';
        } else if (i === 0 && b === 1) {
          bStatus = 'RESERVED';
        } else if (i === 1 && b === 1) {
          bStatus = 'RESERVED';
        } else if (!noIcuSet.has(i) && b <= 3 + (i % 4)) {
          bStatus = 'AVAILABLE';
        }
        insertBed.run(bedId, hid, 'ICU', bStatus, null, iso(0));
      }

      for (let b = 1; b <= ventCount; b++) {
        const bedId = `BED-${num}-VENT-${String(b).padStart(3, '0')}`;
        const bStatus = !noVentSet.has(i) && b <= 3 + (i % 3) ? 'AVAILABLE' : 'OCCUPIED';
        insertBed.run(bedId, hid, 'VENTILATOR', bStatus, null, iso(0));
      }

      for (let b = 1; b <= genCount; b++) {
        const bedId = `BED-${num}-GEN-${String(b).padStart(3, '0')}`;
        const bStatus = !noGenSet.has(i) && b <= 16 + (i % 10) ? 'AVAILABLE' : 'OCCUPIED';
        insertBed.run(bedId, hid, 'GENERAL', bStatus, null, iso(0));
      }
    }

    // 3. Seed Sample Patients linked to specific Bed IDs
    const patients = [
      ['PAT-101', 'HYD-88410', 'Srinivasulu Naidu', 64, 'Acute ST-Elevation Myocardial Infarction', 'CRITICAL', 'RESERVED', 'HOSP-01', 'BED-01-ICU-001', 'ICU', 3],
      ['PAT-102', 'HYD-88411', 'Farhana Begum', 51, 'Severe Respiratory Distress / ARDS', 'CRITICAL', 'RESERVED', 'HOSP-02', 'BED-02-ICU-001', 'ICU', 2],
      ['PAT-103', 'HYD-88412', 'Rameshwar Yadav', 38, 'ORR Multi-Trauma Road Traffic Accident', 'CRITICAL', 'IN_AMBULANCE', null, null, null, 1],
      ['PAT-104', 'HYD-88413', 'Lakshmi Narayana', 72, 'Acute Ischemic Stroke (Thrombolysis Window)', 'HIGH', 'IN_AMBULANCE', null, null, null, 1],
      ['PAT-105', 'HYD-88414', 'Syed Imran Ali', 45, 'Acute Severe Asthma Exacerbation', 'HIGH', 'ADMITTED', 'HOSP-03', 'BED-03-VENT-014', 'VENTILATOR', 4],
      ['PAT-106', 'HYD-88415', 'Divya Bharathi', 29, 'Compound Tibia Fracture & Concussion', 'NORMAL', 'IN_AMBULANCE', null, null, null, 1],
      ['PAT-107', 'HYD-88416', 'Venkateswara Sharma', 69, 'Decompensated Heart Failure', 'HIGH', 'ADMITTED', 'HOSP-07', 'BED-07-GEN-072', 'GENERAL', 3],
      ['PAT-108', 'HYD-88417', 'Kavitha Deshmukh', 58, 'Post-Op Sepsis Monitoring', 'CRITICAL', 'ADMITTED', 'HOSP-04', 'BED-04-ICU-016', 'ICU', 5],
      ['PAT-109', 'HYD-88418', 'Prakash Chary', 61, 'Acute COPD Exacerbation', 'HIGH', 'ADMITTED', 'HOSP-01', 'BED-01-VENT-014', 'VENTILATOR', 2],
      ['PAT-110', 'HYD-88419', 'Meenakshi Iyer', 43, 'Post-Surgical Trauma Observation', 'NORMAL', 'ADMITTED', 'HOSP-01', 'BED-01-GEN-072', 'GENERAL', 2],
    ] as const;

    const insertPatient = db.prepare(`
      INSERT INTO Patients (id, mrn, name, age, condition, priority, status, hospital_id, bed_id, bed_type, last_sequence_number, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const assignPatientBed = db.prepare(`UPDATE Beds SET patient_id = ? WHERE id = ?`);

    for (const p of patients) {
      insertPatient.run(...p, iso(-2));
      if (p[8]) {
        assignPatientBed.run(p[0], p[8]);
      }
    }

    // 4. Seed 22 Ambulances positioned across Greater Hyderabad
    const ambLocations: Array<[string, number, number]> = [
      ['EMT R. Srinivas (108)', 17.4165, 78.4310],
      ['EMT M. Pasha (108)', 17.4395, 78.4945],
      ['EMT K. Mahesh (108)', 17.4412, 78.3820],
      ['Lead V. Goud (108)', 17.4240, 78.4580],
      ['EMT S. Sunitha (108)', 17.4605, 78.3680],
      ['EMT P. Raju (108)', 17.4885, 78.4050],
      ['EMT A. Kareem (108)', 17.3760, 78.4770],
      ['EMT N. Prasad (108)', 17.3510, 78.5505],
      ['EMT B. Kiran (108)', 17.3925, 78.4350],
      ['EMT D. Swapna (108)', 17.4010, 78.4810],
      ['EMT T.Harish (108)', 17.4418, 78.4625],
      ['EMT G. Venkat (108)', 17.3980, 78.5560],
      ['EMT L. Jyothi (108)', 17.4795, 78.5590],
      ['EMT C. Naveen (108)', 17.5140, 78.4770],
      ['EMT F. Tajuddin (108)', 17.3405, 78.5100],
      ['EMT H. Deepika (108)', 17.4650, 78.3160],
      ['EMT J. Suresh (108)', 17.4930, 78.3420],
      ['EMT U. Madhavi (108)', 17.3680, 78.4290],
      ['EMT Y. Ashok (108)', 17.2780, 78.3990],
      ['EMT E. Rajesh (108)', 17.4170, 78.3410],
      ['EMT I. Sailaja (108)', 17.5420, 78.3810],
      ['EMT Z. Irfan (108)', 17.3735, 78.5030],
    ];

    const insertAmb = db.prepare(`
      INSERT INTO Ambulances (id, call_sign, crew_lead, latitude, longitude, status, assigned_request_id, target_hospital_id, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (let i = 0; i < 22; i++) {
      const code = `AMB-${101 + i}`;
      const [crew, lat, lng] = ambLocations[i];

      let status = 'AVAILABLE';
      let reqId: string | null = null;
      let targetHosp: string | null = null;
      if (i === 0) { status = 'EN_ROUTE'; reqId = 'REQ-101'; targetHosp = 'HOSP-01'; }
      else if (i === 1) { status = 'EN_ROUTE'; reqId = 'REQ-102'; targetHosp = 'HOSP-02'; }
      else if (i === 2) { status = 'DISPATCHED'; reqId = 'REQ-103'; }
      else if (i === 4) { status = 'DISPATCHED'; reqId = 'REQ-104'; }
      else if (i === 9) { status = 'DISPATCHED'; reqId = 'REQ-106'; }
      else if (i === 10) { status = 'AT_HOSPITAL'; targetHosp = 'HOSP-02'; }
      else if (i === 21) { status = 'OFFLINE'; }

      insertAmb.run(code, code, crew, lat, lng, status, reqId, targetHosp, iso(-1));
    }

    // 5. Seed Emergency Requests across Hyderabad corridors
    const requests = [
      ['REQ-101', 'PAT-101', 'Srinivasulu Naidu', 'Acute ST-Elevation Myocardial Infarction', 'CRITICAL', 'ICU', 'AMB-101', 17.4165, 78.4310, 'Banjara Hills / Road No. 12', 'RESERVED', 'HOSP-01', 'RES-101', iso(-6), iso(-5)],
      ['REQ-102', 'PAT-102', 'Farhana Begum', 'Severe Respiratory Distress / ARDS', 'CRITICAL', 'ICU', 'AMB-102', 17.4395, 78.4945, 'Secunderabad / Paradise Circle', 'RESERVED', 'HOSP-02', 'RES-102', iso(-4), iso(-3)],
      ['REQ-103', 'PAT-103', 'Rameshwar Yadav', 'ORR Multi-Trauma Road Traffic Accident', 'CRITICAL', 'ICU', 'AMB-103', 17.4412, 78.3820, 'HITEC City / Cyber Towers', 'OPEN', null, null, iso(-2), iso(-2)],
      ['REQ-104', 'PAT-104', 'Lakshmi Narayana', 'Acute Ischemic Stroke (Thrombolysis Window)', 'HIGH', 'VENTILATOR', 'AMB-105', 17.4605, 78.3680, 'Kondapur Junction / Botanical Garden Rd', 'OPEN', null, null, iso(-1), iso(-1)],
      ['REQ-106', 'PAT-106', 'Divya Bharathi', 'Compound Tibia Fracture & Concussion', 'NORMAL', 'GENERAL', 'AMB-110', 17.4010, 78.4810, 'Himayatnagar / Liberty X Roads', 'OPEN', null, null, iso(-3), iso(-3)],
    ];

    const insertReq = db.prepare(`
      INSERT INTO EmergencyRequests (id, patient_id, patient_name, condition, priority, required_bed_type, ambulance_id, latitude, longitude, location_label, status, assigned_hospital_id, reservation_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const r of requests) {
      insertReq.run(...r);
    }

    // 6. Seed Active Reservations (with 15-minute expiry window & specific Bed IDs)
    const insertRes = db.prepare(`
      INSERT INTO BedReservations (id, hospital_id, bed_id, bed_type, patient_id, ambulance_id, request_id, transfer_id, priority, status, created_at, expires_at, confirmed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    insertRes.run('RES-101', 'HOSP-01', 'BED-01-ICU-001', 'ICU', 'PAT-101', 'AMB-101', 'REQ-101', null, 'CRITICAL', 'ACTIVE', iso(-5), iso(10), null);
    insertRes.run('RES-102', 'HOSP-02', 'BED-02-ICU-001', 'ICU', 'PAT-102', 'AMB-102', 'REQ-102', null, 'CRITICAL', 'ACTIVE', iso(-3), iso(12), null);

    // 7. Seed Hospital Transfer Requests
    const insertTrf = db.prepare(`
      INSERT INTO TransferRequests (id, patient_id, patient_name, patient_condition, from_hospital_id, to_hospital_id, required_bed_type, priority, reason, status, reservation_id, bed_id, saga_step, compensation_note, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    insertTrf.run(
      'TRF-201',
      'PAT-107',
      'Venkateswara Sharma',
      'Decompensated Heart Failure',
      'HOSP-07',
      'HOSP-01',
      'ICU',
      'HIGH',
      'Escalation to Cardiac ICU for hemodynamic monitoring',
      'PENDING',
      null,
      null,
      'AWAITING_RECEIVING_HOSPITAL_CONFIRMATION',
      null,
      iso(-8),
      iso(-8)
    );
    insertTrf.run(
      'TRF-202',
      'PAT-108',
      'Kavitha Deshmukh',
      'Post-Op Sepsis Monitoring',
      'HOSP-06',
      'HOSP-04',
      'ICU',
      'CRITICAL',
      'Continuous renal replacement therapy required',
      'COMPLETED',
      null,
      'BED-04-ICU-016',
      'SAGA_COMMITTED_BED_OCCUPIED',
      null,
      iso(-45),
      iso(-20)
    );

    // 8. Seed Initial AuditLogs
    const insertAudit = db.prepare(`
      INSERT INTO AuditLogs (id, event_id, event_type, actor, hospital_id, patient_id, bed_id, summary, metadata, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const initialLogs = [
      ['AUD-1', uuidv4(), 'BedReserved', 'AMB-101 · R. Srinivas', 'HOSP-01', 'PAT-101', 'BED-01-ICU-001', 'Reserved BED-01-ICU-001 at Apollo Hospitals, Jubilee Hills for Srinivasulu Naidu (CRITICAL)', '{"bed_type":"ICU","ttl_min":15}', iso(-5)],
      ['AUD-2', uuidv4(), 'BedReserved', 'AMB-102 · M. Pasha', 'HOSP-02', 'PAT-102', 'BED-02-ICU-001', 'Reserved BED-02-ICU-001 at KIMS Hospitals, Secunderabad for Farhana Begum (CRITICAL)', '{"bed_type":"ICU","ttl_min":15}', iso(-3)],
      ['AUD-3', uuidv4(), 'TransferRequested', 'Continental Hospitals, Nanakramguda', 'HOSP-01', 'PAT-107', null, 'Transfer requested for Venkateswara Sharma from Continental Nanakramguda to Apollo Jubilee Hills (ICU)', '{"transfer_id":"TRF-201"}', iso(-8)],
      ['AUD-4', uuidv4(), 'TransferCompleted', "NIMS (Nizam's Institute of Medical Sciences)", 'HOSP-04', 'PAT-108', 'BED-04-ICU-016', 'Completed ICU transfer for Kavitha Deshmukh into BED-04-ICU-016', '{"transfer_id":"TRF-202"}', iso(-20)],
      ['AUD-5', uuidv4(), 'AmbulanceDispatched', 'Hyderabad Control Room', null, 'PAT-103', null, 'Dispatched AMB-103 to HITEC City / Cyber Towers for ORR Multi-Trauma case (CRITICAL)', '{"request_id":"REQ-103"}', iso(-2)],
    ];
    for (const l of initialLogs) {
      insertAudit.run(...l);
    }
  });

  insertAll();
}
