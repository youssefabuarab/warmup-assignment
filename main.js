const fs = require("fs");

// Helper: parse "hh:mm:ss am/pm" into total seconds
function parseTimeAmPm(str) {
    str = String(str).trim();
    const parts = str.split(/\s+/);
    const timePart = parts[0];
    const ampm = (parts[1] || "").toLowerCase();
    const [h, m, s] = timePart.split(":").map(Number);
    let hour = h;
    if (ampm === "pm" && hour !== 12) hour += 12;
    if (ampm === "am" && hour === 12) hour = 0;
    return hour * 3600 + (m || 0) * 60 + (s || 0);
}

// Helper: parse "h:mm:ss" or "hhh:mm:ss" into total seconds
function parseTimeHMS(str) {
    str = String(str).trim();
    const [h, m, s] = str.split(":").map(Number);
    return (h || 0) * 3600 + (m || 0) * 60 + (s || 0);
}

// Helper: convert seconds to "h:mm:ss"
function secondsToHMS(totalSeconds) {
    if (totalSeconds < 0) totalSeconds = 0;
    const h = Math.floor(totalSeconds / 3600);
    const r = totalSeconds % 3600;
    const m = Math.floor(r / 60);
    const s = r % 60;
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

// Helper: convert seconds to "hhh:mm:ss"
function secondsToHHHMMSS(totalSeconds) {
    if (totalSeconds < 0) totalSeconds = 0;
    const h = Math.floor(totalSeconds / 3600);
    const r = totalSeconds % 3600;
    const m = Math.floor(r / 60);
    const s = r % 60;
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

// Function 1
function getShiftDuration(startTime, endTime) {
    let startSec = parseTimeAmPm(startTime);
    let endSec = parseTimeAmPm(endTime);
    if (endSec <= startSec) endSec += 24 * 3600;
    return secondsToHMS(endSec - startSec);
}

// Function 2
function getIdleTime(startTime, endTime) {
    const DELIVERY_START = 8 * 3600;   // 8:00 AM
    const DELIVERY_END = 22 * 3600;    // 10:00 PM
    let startSec = parseTimeAmPm(startTime);
    let endSec = parseTimeAmPm(endTime);
    let idleSec = 0;
    if (endSec <= startSec) endSec += 24 * 3600;
    if (startSec < DELIVERY_START) {
        idleSec += Math.min(DELIVERY_START, endSec) - startSec;
    }
    if (endSec > DELIVERY_END) {
        idleSec += endSec - Math.max(DELIVERY_END, startSec);
    }
    return secondsToHMS(idleSec);
}

// Function 3
function getActiveTime(shiftDuration, idleTime) {
    const shiftSec = parseTimeHMS(shiftDuration);
    const idleSec = parseTimeHMS(idleTime);
    return secondsToHMS(Math.max(0, shiftSec - idleSec));
}

// Function 4
function metQuota(date, activeTime) {
    const [y, m, d] = (String(date).trim()).split("-").map(Number);
    const activeSec = parseTimeHMS(activeTime);
    const eidStart = new Date(2025, 3, 10).getTime();
    const eidEnd = new Date(2025, 3, 30).getTime();
    const dayDate = new Date(y, m - 1, d).getTime();
    const isEid = dayDate >= eidStart && dayDate <= eidEnd;
    const quotaSec = isEid ? 6 * 3600 : (8 * 3600 + 24 * 60);
    return activeSec >= quotaSec;
}

// Helper: parse one CSV shift line into an object
function parseShiftLine(line) {
    const parts = line.split(",");
    if (parts.length < 10) return null;
    return {
        driverID: parts[0].trim(),
        driverName: parts[1].trim(),
        date: parts[2].trim(),
        startTime: parts[3].trim(),
        endTime: parts[4].trim(),
        shiftDuration: parts[5].trim(),
        idleTime: parts[6].trim(),
        activeTime: parts[7].trim(),
        metQuota: parts[8].trim().toLowerCase() === "true",
        hasBonus: parts[9].trim().toLowerCase() === "true"
    };
}

// Function 5
function addShiftRecord(textFile, shiftObj) {
    const driverID = String(shiftObj.driverID || "").trim();
    const driverName = String(shiftObj.driverName || "").trim();
    const date = String(shiftObj.date || "").trim();
    const startTime = String(shiftObj.startTime || "").trim();
    const endTime = String(shiftObj.endTime || "").trim();

    let content = "";
    try {
        content = fs.readFileSync(textFile, { encoding: "utf8" });
    } catch (e) {
        content = "DriverID,DriverName,Date,StartTime,EndTime,ShiftDuration,IdleTime,ActiveTime,MetQuota,HasBonus\n";
    }
    const lines = content.split(/\r?\n/).filter(l => l.length > 0);
    if (lines.length === 0) {
        lines.push("DriverID,DriverName,Date,StartTime,EndTime,ShiftDuration,IdleTime,ActiveTime,MetQuota,HasBonus");
    }
    const header = lines[0];
    const dataLines = lines.slice(1);

    for (let i = 0; i < dataLines.length; i++) {
        const p = dataLines[i].split(",");
        const rowId = (p[0] || "").trim();
        const rowDate = (p[2] || "").trim();
        if (rowId === driverID && rowDate === date) return {};
    }

    const shiftDuration = getShiftDuration(startTime, endTime);
    const idleTime = getIdleTime(startTime, endTime);
    const activeTime = getActiveTime(shiftDuration, idleTime);
    const met = metQuota(date, activeTime);
    const hasBonus = false;
    const newObj = {
        driverID,
        driverName,
        date,
        startTime,
        endTime,
        shiftDuration,
        idleTime,
        activeTime,
        metQuota: met,
        hasBonus
    };

    let lastIdx = -1;
    for (let i = 0; i < dataLines.length; i++) {
        const p = dataLines[i].split(",");
        if ((p[0] || "").trim() === driverID) lastIdx = i;
    }
    const newRow = [driverID, driverName, date, startTime, endTime, shiftDuration, idleTime, activeTime, String(met), String(hasBonus)].join(",");
    if (lastIdx === -1) {
        dataLines.push(newRow);
    } else {
        dataLines.splice(lastIdx + 1, 0, newRow);
    }
    const out = [header, ...dataLines].join("\n");
    fs.writeFileSync(textFile, out, { encoding: "utf8" });
    return newObj;
}

// Function 6
function setBonus(textFile, driverID, date, newValue) {
    const content = fs.readFileSync(textFile, { encoding: "utf8" });
    const lines = content.split(/\r?\n/);
    const did = String(driverID).trim();
    const d = String(date).trim();
    const newVal = newValue === true ? "true" : "false";
    for (let i = 0; i < lines.length; i++) {
        const parts = lines[i].split(",");
        if (parts.length >= 10 && (parts[0] || "").trim() === did && (parts[2] || "").trim() === d) {
            parts[9] = newVal;
            lines[i] = parts.join(",");
            break;
        }
    }
    fs.writeFileSync(textFile, lines.join("\n"), { encoding: "utf8" });
}

// Function 7
function countBonusPerMonth(textFile, driverID, month) {
    const content = fs.readFileSync(textFile, { encoding: "utf8" });
    const lines = content.split(/\r?\n/);
    const did = String(driverID).trim();
    const monthNum = parseInt(String(month).trim(), 10);
    if (isNaN(monthNum) || monthNum < 1 || monthNum > 12) return -1;
    let driverExists = false;
    let count = 0;
    for (let i = 1; i < lines.length; i++) {
        const parts = lines[i].split(",");
        if (parts.length < 10) continue;
        const rowId = (parts[0] || "").trim();
        if (rowId !== did) continue;
        driverExists = true;
        const rowDate = (parts[2] || "").trim();
        const rowMonth = parseInt(rowDate.split("-")[1], 10);
        if (rowMonth === monthNum && (parts[9] || "").trim().toLowerCase() === "true") count++;
    }
    return driverExists ? count : -1;
}

// Function 8
function getTotalActiveHoursPerMonth(textFile, driverID, month) {
    const content = fs.readFileSync(textFile, { encoding: "utf8" });
    const lines = content.split(/\r?\n/);
    const did = String(driverID).trim();
    const monthNum = Number(month);
    let totalSec = 0;
    for (let i = 1; i < lines.length; i++) {
        const parts = lines[i].split(",");
        if (parts.length < 10) continue;
        const rowId = (parts[0] || "").trim();
        const rowDate = (parts[2] || "").trim();
        const rowMonth = parseInt(rowDate.split("-")[1], 10);
        if (rowId === did && rowMonth === monthNum) {
            totalSec += parseTimeHMS((parts[7] || "0:0:0").trim());
        }
    }
    return secondsToHHHMMSS(totalSec);
}


// Helper: check if date is within Eid period (2025-04-10 to 2025-04-30)
function isEidDate(dateStr) {
    const [y, m, d] = dateStr.split("-").map(Number);
    if (y !== 2025 || m !== 4) return false;
    return d >= 10 && d <= 30;
}

// Function 9
function getRequiredHoursPerMonth(textFile, rateFile, bonusCount, driverID, month) {
    const rateContent = fs.readFileSync(rateFile, { encoding: "utf8" });
    const rateLines = rateContent.split(/\r?\n/);
    let dayOff = "";
    for (let i = 0; i < rateLines.length; i++) {
        const p = rateLines[i].split(",");
        if ((p[0] || "").trim() === String(driverID).trim()) {
            dayOff = (p[1] || "").trim();
            break;
        }
    }
    const shiftContent = fs.readFileSync(textFile, { encoding: "utf8" });
    const shiftLines = shiftContent.split(/\r?\n/);
    const monthNum = Number(month);
    const QUOTA_NORMAL_SEC = 8 * 3600 + 24 * 60;
    const QUOTA_EID_SEC = 6 * 3600;
    let totalSec = 0;
    const seenDates = new Set();
    for (let i = 1; i < shiftLines.length; i++) {
        const parts = shiftLines[i].split(",");
        if (parts.length < 10) continue;
        const rowId = (parts[0] || "").trim();
        const rowDate = (parts[2] || "").trim();
        const rowMonth = parseInt(rowDate.split("-")[1], 10);
        if (rowId !== String(driverID).trim() || rowMonth !== monthNum) continue;
        if (seenDates.has(rowDate)) continue;
        seenDates.add(rowDate);
        const dayName = getDayName(rowDate);
        if (dayName === dayOff) continue;
        totalSec += isEidDate(rowDate) ? QUOTA_EID_SEC : QUOTA_NORMAL_SEC;
    }
    totalSec -= 2 * 3600 * Number(bonusCount);
    if (totalSec < 0) totalSec = 0;
    return secondsToHHHMMSS(totalSec);
}

// Function 10
function getNetPay(driverID, actualHours, requiredHours, rateFile) {
    const rateContent = fs.readFileSync(rateFile, { encoding: "utf8" });
    const rateLines = rateContent.split(/\r?\n/);

    let basePay = 0;
    let tier = 0;
    const did = String(driverID).trim();

    for (let i = 0; i < rateLines.length; i++) {
        if (!rateLines[i]) continue;
        const p = rateLines[i].split(",");
        if ((p[0] || "").trim() === did) {
            basePay = parseInt((p[2] || "0").trim(), 10) || 0;
            tier = parseInt((p[3] || "0").trim(), 10) || 0;
            break;
        }
    }

    if (!basePay) return 0;

    const actualSec = parseTimeHMS(actualHours);
    const requiredSec = parseTimeHMS(requiredHours);

    if (actualSec >= requiredSec) return basePay;

    let missingSec = requiredSec - actualSec;

    const tierAllowance = {
        1: 50,
        2: 20,
        3: 10,
        4: 3
    };

    const allowedHours = tierAllowance[tier] || 0;
    const allowedSec = allowedHours * 3600;

    if (missingSec <= allowedSec) return basePay;

    missingSec -= allowedSec;
    const billableHours = Math.floor(missingSec / 3600);

    if (billableHours <= 0) return basePay;

    const deductionRatePerHour = Math.floor(basePay / 185);
    const salaryDeduction = billableHours * deductionRatePerHour;
    const netPay = basePay - salaryDeduction;

    return netPay;
}

module.exports = {
    getShiftDuration,
    getIdleTime,
    getActiveTime,
    metQuota,
    addShiftRecord,
    setBonus,
    countBonusPerMonth,
    getTotalActiveHoursPerMonth,
    getRequiredHoursPerMonth,
    getNetPay
};
