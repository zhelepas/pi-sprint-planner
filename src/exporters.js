import { state, activeProject, fileBase } from './state.js';

export function columns() {
    return [{ id: null, name: 'Backlog', capacity: null }, ...state.sprints];
}

export function storiesIn(feature, columnId) {
    return feature.stories.filter(s => (s.sprintId || null) === columnId);
}

export function columnLoad(columnId) {
    return state.features.reduce((sum, f) =>
        sum + storiesIn(f, columnId).reduce((a, s) => a + (s.points || 0), 0), 0);
}

export function download(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

export function exportJson() {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    download(blob, `${fileBase()}.json`);
}

export function csvCell(value) {
    let field = String(value ?? '');
    if (/^[=+\-@\t\r]/.test(field)) field = `'${field}`;
    return /[",\n\r]/.test(field) ? `"${field.replace(/"/g, '""')}"` : field;
}

export function grid() {
    const cols = columns();
    return {
        cols,
        header: ['Feature', ...cols.map(c => c.name)],
        capacity: ['Capacity', '', ...state.sprints.map(s => s.capacity || 0)],
        planned: ['Planned', columnLoad(null), ...state.sprints.map(s => sprintLoad(s.id))],
        rows: state.features.map(feature => ({
            feature,
            lists: cols.map(c => storiesIn(feature, c.id).map(s => `${s.title} (${s.points || 0})`))
        })),
        total: ['Total points', ...cols.map(c => columnLoad(c.id))]
    };
}

export function exportCsv() {
    const g = grid();
    const rows = [
        g.header,
        g.capacity,
        g.planned,
        ...g.rows.map(r => [r.feature.name, ...r.lists.map(l => l.join('\n'))]),
        g.total
    ];
    const csv = rows.map(r => r.map(csvCell).join(',')).join('\r\n');
    download(new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' }), `${fileBase()}.csv`);
}

const CRC_TABLE = (() => {
    const table = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
        let c = i;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
        table[i] = c >>> 0;
    }
    return table;
})();

function crc32(bytes) {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
}

function zip(files) {
    const encoder = new TextEncoder();
    const chunks = [];
    const directory = [];
    let offset = 0;

    files.forEach(file => {
        const name = encoder.encode(file.name);
        const data = encoder.encode(file.data);
        const crc = crc32(data);

        const local = new DataView(new ArrayBuffer(30));
        local.setUint32(0, 0x04034b50, true);
        local.setUint16(4, 20, true);
        local.setUint16(6, 0x0800, true);
        local.setUint32(14, crc, true);
        local.setUint32(18, data.length, true);
        local.setUint32(22, data.length, true);
        local.setUint16(26, name.length, true);
        chunks.push(new Uint8Array(local.buffer), name, data);

        const entry = new DataView(new ArrayBuffer(46));
        entry.setUint32(0, 0x02014b50, true);
        entry.setUint16(4, 20, true);
        entry.setUint16(6, 20, true);
        entry.setUint16(8, 0x0800, true);
        entry.setUint32(16, crc, true);
        entry.setUint32(20, data.length, true);
        entry.setUint32(24, data.length, true);
        entry.setUint16(28, name.length, true);
        entry.setUint32(42, offset, true);
        directory.push(new Uint8Array(entry.buffer), name);

        offset += 30 + name.length + data.length;
    });

    const dirSize = directory.reduce((a, b) => a + b.length, 0);
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true);
    end.setUint16(8, files.length, true);
    end.setUint16(10, files.length, true);
    end.setUint32(12, dirSize, true);
    end.setUint32(16, offset, true);

    return new Blob([...chunks, ...directory, new Uint8Array(end.buffer)],
        { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

function xmlEscape(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
}

function hslHex(h, s, l) {
    const sat = s / 100;
    const lig = l / 100;
    const k = n => (n + h / 30) % 12;
    const a = sat * Math.min(lig, 1 - lig);
    const f = n => Math.round(255 * (lig - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1))));
    return [f(0), f(8), f(4)].map(v => v.toString(16).padStart(2, '0')).join('').toUpperCase();
}

function colRef(index) {
    let ref = '';
    let n = index;
    do {
        ref = String.fromCharCode(65 + (n % 26)) + ref;
        n = Math.floor(n / 26) - 1;
    } while (n >= 0);
    return ref;
}

function sheetCell(colIndex, rowIndex, value, styleIndex) {
    const ref = `${colRef(colIndex)}${rowIndex}`;
    if (typeof value === 'number') return `<c r="${ref}" s="${styleIndex}"><v>${value}</v></c>`;
    if (value === '' || value == null) return `<c r="${ref}" s="${styleIndex}"/>`;
    return `<c r="${ref}" s="${styleIndex}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(value)}</t></is></c>`;
}

const XLSX_CHIP = { s: 72, l: 92, border: 78 };

export function exportXlsx() {
    const g = grid();
    const width = g.header.length;

    const fills = ['<fill><patternFill patternType="none"/></fill>',
        '<fill><patternFill patternType="gray125"/></fill>',
        solidFill('FFDCE4EE'), solidFill('FFEEF2F7')];
    const cellXfs = [
        '<xf numFmtId="0" xfId="0" fontId="0" fillId="0" borderId="0"/>',
        '<xf numFmtId="0" xfId="0" fontId="1" fillId="2" borderId="1" applyFill="1" applyFont="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>',
        '<xf numFmtId="0" xfId="0" fontId="1" fillId="3" borderId="1" applyFill="1" applyFont="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>',
        '<xf numFmtId="0" xfId="0" fontId="0" fillId="0" borderId="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>'
    ];
    const STYLE = { header: 1, label: 2, number: 3 };

    const featureStyles = g.rows.map(({ feature }) => {
        const nameFill = fills.push(solidFill(`FF${hslHex(feature.hue, XLSX_CHIP.s, XLSX_CHIP.border)}`)) - 1;
        const cellFill = fills.push(solidFill(`FF${hslHex(feature.hue, XLSX_CHIP.s, XLSX_CHIP.l)}`)) - 1;
        const name = cellXfs.push(`<xf numFmtId="0" xfId="0" fontId="1" fillId="${nameFill}" borderId="1" applyFill="1" applyFont="1" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>`) - 1;
        const cell = cellXfs.push(`<xf numFmtId="0" xfId="0" fontId="0" fillId="${cellFill}" borderId="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>`) - 1;
        return { name, cell };
    });

    const sheetRows = [];
    let r = 0;

    const row = (cells, { height } = {}) => {
        r++;
        const attrs = height ? ` ht="${height}" customHeight="1"` : '';
        sheetRows.push(`<row r="${r}"${attrs}>${cells.map((c, i) => sheetCell(i, r, c.v, c.s)).join('')}</row>`);
    };

    row(g.header.map(v => ({ v, s: STYLE.header })), { height: 22 });
    row(g.capacity.map((v, i) => ({ v, s: i === 0 ? STYLE.label : STYLE.number })));
    row(g.planned.map((v, i) => ({ v, s: i === 0 ? STYLE.label : STYLE.number })));

    const merges = [];
    g.rows.forEach((item, i) => {
        const style = featureStyles[i];
        const points = item.feature.stories.reduce((a, s) => a + (s.points || 0), 0);
        const name = `${item.feature.name}\n${item.feature.stories.length} stories · ${points} pts`;
        const count = Math.max(1, ...item.lists.map(l => l.length));
        const start = r + 1;

        for (let n = 0; n < count; n++) {
            row([
                { v: n === 0 ? name : '', s: style.name },
                ...item.lists.map(list => ({ v: list[n] ?? '', s: style.cell }))
            ], count === 1 ? { height: 32 } : undefined);
        }
        if (count > 1) merges.push(`A${start}:A${start + count - 1}`);
    });

    row(g.total.map(v => ({ v, s: STYLE.label })));

    const mergeXml = merges.length ? `<mergeCells count="${merges.length}">${merges.map(ref => `<mergeCell ref="${ref}"/>`).join('')}</mergeCells>` : '';
    const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView tabSelected="1" workbookViewId="0"><pane xSplit="1" ySplit="1" topLeftCell="B2" activePane="bottomRight" state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="15"/><cols><col min="1" max="1" width="34" customWidth="1"/><col min="2" max="${width}" width="30" customWidth="1"/></cols><sheetData>${sheetRows.join('')}</sheetData>${mergeXml}</worksheet>`;

    const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="${fills.length}">${fills.join('')}</fills><borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color rgb="FFB8C2CC"/></left><right style="thin"><color rgb="FFB8C2CC"/></right><top style="thin"><color rgb="FFB8C2CC"/></top><bottom style="thin"><color rgb="FFB8C2CC"/></bottom><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="${cellXfs.length}">${cellXfs.join('')}</cellXfs></styleSheet>`;

    const files = [
        {
            name: '[Content_Types].xml',
            data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`
        },
        {
            name: '_rels/.rels',
            data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`
        },
        {
            name: 'xl/workbook.xml',
            data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="PI Plan" sheetId="1" r:id="rId1"/></sheets></workbook>`
        },
        {
            name: 'xl/_rels/workbook.xml.rels',
            data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`
        },
        { name: 'xl/styles.xml', data: styles },
        { name: 'xl/worksheets/sheet1.xml', data: sheet }
    ];

    download(zip(files), `${fileBase()}.xlsx`);
}

function solidFill(argb) {
    return `<fill><patternFill patternType="solid"><fgColor rgb="${argb}"/><bgColor indexed="64"/></patternFill></fill>`;
}

function mdCell(value) {
    return String(value ?? '').replace(/\|/g, '\\|').replace(/\s*\n\s*/g, ' ');
}

export function exportMarkdown() {
    const cols = columns();
    const header = ['Feature', ...cols.map(c => c.id ? `${c.name} (${columnLoad(c.id)}/${c.capacity || 0} pts)` : `${c.name} (${columnLoad(null)} pts)`)];

    const lines = [
        `| ${header.map(mdCell).join(' | ')} |`,
        `| ${header.map(() => '---').join(' | ')} |`
    ];

    state.features.forEach(feature => {
        const cells = cols.map(c => storiesIn(feature, c.id)
            .map(s => `${mdCell(s.title)} (${s.points || 0})`)
            .join(', '));
        lines.push(`| ${mdCell(feature.name)} | ${cells.join(' | ')} |`);
    });

    lines.push(`| Total | ${cols.map(c => columnLoad(c.id)).join(' | ')} |`);

    const md = `# ${activeProject().name} — PI Plan — ${new Date().toLocaleString()}\n\n${lines.join('\n')}\n`;
    download(new Blob([md], { type: 'text/markdown;charset=utf-8' }), `${fileBase()}.md`);
}

const IMG = {
    scale: 2,
    pad: 16,
    gap: 8,
    featW: 220,
    colW: 240,
    totalH: 44,
    cellPad: 8,
    chipPad: 6,
    chipGap: 4,
    lineH: 16
};

function css(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function fontUi(size, weight = 400) {
    return `${weight} ${size}px ${css('--font-ui') || 'sans-serif'}`;
}

function fontData(size, weight = 700) {
    return `${weight} ${size}px ${css('--font-data') || 'monospace'}`;
}

function wrap(ctx, value, maxWidth) {
    const words = String(value ?? '').trim().split(/\s+/).filter(Boolean);
    if (!words.length) return [''];
    const lines = [];
    let line = '';
    const push = () => { if (line) lines.push(line); line = ''; };

    words.forEach(word => {
        let candidate = line ? `${line} ${word}` : word;
        if (ctx.measureText(candidate).width <= maxWidth) {
            line = candidate;
            return;
        }
        push();
        line = word;
        while (ctx.measureText(line).width > maxWidth && line.length > 1) {
            let cut = line.length - 1;
            while (cut > 1 && ctx.measureText(line.slice(0, cut)).width > maxWidth) cut--;
            lines.push(line.slice(0, cut));
            line = line.slice(cut);
        }
    });
    push();
    return lines.length ? lines : [''];
}

function drawLines(ctx, lines, x, y, color) {
    ctx.fillStyle = color;
    lines.forEach((line, i) => ctx.fillText(line, x, y + i * IMG.lineH));
    return lines.length * IMG.lineH;
}

export function exportJpg() {
    const cols = columns();
    const colors = {
        bg: css('--bg') || '#fff',
        surface: css('--surface'),
        line: css('--line'),
        text: css('--text'),
        muted: css('--muted'),
        total: css('--total-bg'),
        ok: css('--ok'),
        over: css('--over'),
        chipS: css('--chip-s'),
        chipL: css('--chip-l'),
        chipBorderL: css('--chip-border-l')
    };

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    ctx.textBaseline = 'top';

    const chipTextW = IMG.colW - IMG.cellPad * 2 - 16;
    const layout = state.features.map(feature => {
        ctx.font = fontUi(13, 700);
        const nameLines = wrap(ctx, feature.name, IMG.featW - IMG.cellPad * 2 - 4);
        const featureH = IMG.cellPad * 2 + nameLines.length * IMG.lineH + 20;

        const cells = cols.map(column => storiesIn(feature, column.id).map(story => {
            ctx.font = fontData(12);
            const pointsW = ctx.measureText(String(story.points || 0)).width;
            ctx.font = fontUi(12);
            const lines = wrap(ctx, story.title, chipTextW - pointsW - 8);
            return { story, lines, pointsW, h: IMG.chipPad * 2 + lines.length * IMG.lineH };
        }));

        const cellHeights = cells.map(chips => chips.length
            ? IMG.cellPad * 2 + chips.reduce((a, c) => a + c.h, 0) + (chips.length - 1) * IMG.chipGap
            : 0);

        return { feature, nameLines, cells, h: Math.max(featureH, ...cellHeights, 48) };
    });

    ctx.font = fontUi(13, 700);
    const headerCols = cols.map(column => {
        const used = columnLoad(column.id);
        return {
            column,
            used,
            nameLines: wrap(ctx, column.name, IMG.colW - IMG.cellPad * 2),
            detail: column.id ? `${used} / ${column.capacity || 0} pts` : `Unassigned: ${used} pts`,
            over: Boolean(column.id) && used > (column.capacity || 0)
        };
    });
    const headH = IMG.cellPad * 2 + Math.max(...headerCols.map(h => h.nameLines.length)) * IMG.lineH + IMG.lineH + 4;

    const width = IMG.pad * 2 + IMG.featW + cols.length * (IMG.colW + IMG.gap);
    const height = IMG.pad * 2 + headH + IMG.totalH + layout.reduce((a, r) => a + r.h, 0) + (layout.length + 1) * IMG.gap;

    canvas.width = width * IMG.scale;
    canvas.height = height * IMG.scale;
    ctx.scale(IMG.scale, IMG.scale);
    ctx.textBaseline = 'top';

    ctx.fillStyle = colors.bg;
    ctx.fillRect(0, 0, width, height);
    const colX = i => IMG.pad + IMG.featW + IMG.gap + i * (IMG.colW + IMG.gap);
    const box = (x, y, w, h, fill) => {
        ctx.fillStyle = fill;
        ctx.fillRect(x, y, w, h);
        ctx.strokeStyle = colors.line;
        ctx.lineWidth = 1;
        ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    };

    let y = IMG.pad;
    box(IMG.pad, y, IMG.featW, headH, colors.surface);
    ctx.font = fontUi(13, 700);
    drawLines(ctx, ['Features / Sprints'], IMG.pad + IMG.cellPad, y + IMG.cellPad, colors.text);
    headerCols.forEach((head, i) => {
        const x = colX(i);
        box(x, y, IMG.colW, headH, colors.surface);
        ctx.font = fontUi(13, 700);
        const used = drawLines(ctx, head.nameLines, x + IMG.cellPad, y + IMG.cellPad, colors.text);
        ctx.font = fontUi(12);
        drawLines(ctx, [head.detail], x + IMG.cellPad, y + IMG.cellPad + used + 4, head.over ? colors.over : colors.muted);
    });
    y += headH + IMG.gap;

    layout.forEach(row => {
        const { feature, h } = row;
        box(IMG.pad, y, IMG.featW, h, colors.surface);
        ctx.fillStyle = `hsl(${feature.hue} ${colors.chipS} ${colors.chipBorderL})`;
        ctx.fillRect(IMG.pad, y, 4, h);

        ctx.font = fontUi(13, 700);
        const nameH = drawLines(ctx, row.nameLines, IMG.pad + IMG.cellPad + 4, y + IMG.cellPad, colors.text);
        const pts = feature.stories.reduce((a, s) => a + (s.points || 0), 0);
        ctx.font = fontUi(12);
        drawLines(ctx, [`${feature.stories.length} stories · ${pts} pts`], IMG.pad + IMG.cellPad + 4, y + IMG.cellPad + nameH + 2, colors.muted);

        row.cells.forEach((chips, i) => {
            const x = colX(i);
            box(x, y, IMG.colW, h, colors.surface);
            let cy = y + IMG.cellPad;
            chips.forEach(chip => {
                const cw = IMG.colW - IMG.cellPad * 2;
                ctx.fillStyle = `hsl(${feature.hue} ${colors.chipS} ${colors.chipL})`;
                ctx.fillRect(x + IMG.cellPad, cy, cw, chip.h);
                ctx.strokeStyle = `hsl(${feature.hue} ${colors.chipS} ${colors.chipBorderL})`;
                ctx.strokeRect(x + IMG.cellPad + 0.5, cy + 0.5, cw - 1, chip.h - 1);
                ctx.font = fontUi(12);
                drawLines(ctx, chip.lines, x + IMG.cellPad + 8, cy + IMG.chipPad, colors.text);
                ctx.font = fontData(12);
                ctx.fillStyle = colors.text;
                ctx.fillText(String(chip.story.points || 0), x + IMG.cellPad + cw - 8 - chip.pointsW, cy + IMG.chipPad);
                cy += chip.h + IMG.chipGap;
            });
        });
        y += h + IMG.gap;
    });

    box(IMG.pad, y, IMG.featW, IMG.totalH, colors.total);
    ctx.font = fontUi(13, 700);
    drawLines(ctx, ['Total points'], IMG.pad + IMG.cellPad, y + 12, colors.text);
    cols.forEach((column, i) => {
        const x = colX(i);
        const used = columnLoad(column.id);
        const over = column.id && used > (column.capacity || 0);
        box(x, y, IMG.colW, IMG.totalH, colors.total);
        ctx.font = fontUi(15, 700);
        ctx.fillStyle = over ? colors.over : colors.ok;
        const usedW = ctx.measureText(String(used)).width;
        ctx.fillText(String(used), x + IMG.cellPad, y + 10);
        if (column.id) {
            const left = (column.capacity || 0) - used;
            ctx.font = fontUi(12);
            ctx.fillStyle = colors.muted;
            ctx.fillText(left >= 0 ? `${left} left` : `${Math.abs(left)} over`, x + IMG.cellPad + usedW + 10, y + 14);
        }
    });

    canvas.toBlob(blob => {
        if (blob) download(blob, `${fileBase()}.jpg`);
    }, 'image/jpeg', 0.92);
}

export function sprintLoad(sprintId) {
    return state.features.reduce((sum, f) =>
        sum + f.stories.filter(s => s.sprintId === sprintId).reduce((a, s) => a + (s.points || 0), 0), 0);
}
