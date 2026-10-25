"""Таблица коэффициентов-множителей для аннуитетного кредита (PDF).

K = общая сумма выплат / сумма кредита = n * r / (1 - (1 + r)^-n),
где r — месячная ставка (годовая / 12), n — срок в месяцах.
Переплата = S * (K - 1).
"""
import sys

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

pdfmetrics.registerFont(TTFont("DejaVu", "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"))
pdfmetrics.registerFont(TTFont("DejaVu-Bold", "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"))

YEARS = range(10, 31)                              # 10..30 лет, шаг 1 год
RATES = [round(4.0 + i * 0.1, 1) for i in range(41)]  # 4,0..8,0 %, шаг 0,1


def coefficient(annual_pct, months):
    r = annual_pct / 100 / 12
    return months * r / (1 - (1 + r) ** -months)


def fmt(x, digits=3):
    return f"{x:.{digits}f}".replace(".", ",")


def build(path):
    doc = SimpleDocTemplate(path, pagesize=landscape(A4),
                            leftMargin=24, rightMargin=24, topMargin=20, bottomMargin=18,
                            title="Коэффициенты-множители аннуитетного кредита")
    title = ParagraphStyle("t", fontName="DejaVu-Bold", fontSize=12, leading=15)
    note = ParagraphStyle("n", fontName="DejaVu", fontSize=7, leading=9, textColor=colors.HexColor("#333333"))

    header_years = ["Ставка"] + [f"{y} лет" if y % 10 in (0, 5, 6, 7, 8, 9) or 11 <= y % 100 <= 14
                                 else (f"{y} год" if y % 10 == 1 else f"{y} года") for y in YEARS]
    header_months = ["годовых"] + [f"{y * 12} мес" for y in YEARS]
    rows = [header_years, header_months]
    for rate in RATES:
        rows.append([fmt(rate, 1) + " %"] + [fmt(coefficient(rate, y * 12)) for y in YEARS])

    col_w = (doc.width - 44) / len(YEARS)
    table = Table(rows, colWidths=[44] + [col_w] * len(YEARS), rowHeights=[11, 10] + [11.6] * len(RATES))

    style = [
        ("FONTNAME", (0, 0), (-1, -1), "DejaVu"),
        ("FONTSIZE", (0, 0), (-1, -1), 7),
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 1),
        ("FONTNAME", (0, 0), (-1, 0), "DejaVu-Bold"),
        ("FONTNAME", (0, 2), (0, -1), "DejaVu-Bold"),
        ("BACKGROUND", (0, 0), (-1, 1), colors.HexColor("#1f3b5c")),
        ("TEXTCOLOR", (0, 0), (-1, 1), colors.white),
        ("BACKGROUND", (0, 2), (0, -1), colors.HexColor("#e3e9f1")),
        ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#b8c2cc")),
        ("BOX", (0, 0), (-1, -1), 0.8, colors.HexColor("#1f3b5c")),
    ]
    for i, rate in enumerate(RATES):
        row = i + 2
        if abs(rate - round(rate)) < 1e-9:           # целые проценты — выделяем строку
            style += [("BACKGROUND", (1, row), (-1, row), colors.HexColor("#fff3cd")),
                      ("LINEABOVE", (0, row), (-1, row), 0.8, colors.HexColor("#1f3b5c"))]
        elif i % 2 == 0:
            style.append(("BACKGROUND", (1, row), (-1, row), colors.HexColor("#f6f8fa")))
    for j, y in enumerate(YEARS):
        if y % 5 == 0:                               # 10, 15, 20, 25, 30 лет — разделители
            style.append(("LINEBEFORE", (j + 1, 0), (j + 1, -1), 0.8, colors.HexColor("#1f3b5c")))
    table.setStyle(TableStyle(style))

    story = [
        Paragraph("Коэффициент-множитель K = общая сумма выплат / сумма кредита (аннуитет)", title),
        Spacer(1, 4),
        table,
        Spacer(1, 4),
        Paragraph(
            "K = n·r / (1 − (1 + r)<super>−n</super>), где r = годовая ставка / 12, n — срок в месяцах. "
            "Общая сумма выплат = S × K;  переплата = S × (K − 1);  ежемесячный платёж = S × K / n. "
            "Пример: 4 600 000 ₽ под 6,0 % на 20 лет → K = " + fmt(coefficient(6.0, 240))
            + ", выплаты ≈ " + f"{4_600_000 * coefficient(6.0, 240):,.0f}".replace(",", " ")
            + " ₽, переплата ≈ " + f"{4_600_000 * (coefficient(6.0, 240) - 1):,.0f}".replace(",", " ") + " ₽.",
            note),
    ]
    doc.build(story)


if __name__ == "__main__":
    build(sys.argv[1] if len(sys.argv) > 1 else "coef_table.pdf")
