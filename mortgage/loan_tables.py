"""Таблицы для аннуитетного кредита (PDF).

K = общая сумма выплат / сумма кредита = n * r / (1 - (1 + r)^-n),
где r — месячная ставка (годовая / 12), n — срок в месяцах.

  overpayment_table.pdf  — переплата, % от суммы кредита: (K - 1) * 100
  payment_table.pdf      — множитель ежемесячного платежа: K / n
  monthly_rate_table.pdf — месячная ставка r (множитель процентов за месяц)
"""
import os
import sys

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

pdfmetrics.registerFont(TTFont("DejaVu", "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"))
pdfmetrics.registerFont(TTFont("DejaVu-Bold", "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"))

YEARS = range(10, 31)                                 # 10..30 лет, шаг 1 год
RATES = [round(4.0 + i * 0.1, 1) for i in range(41)]  # 4,0..8,0 %, шаг 0,1
MILLION = 1_000_000

NAVY = colors.HexColor("#1f3b5c")
TITLE = ParagraphStyle("t", fontName="DejaVu-Bold", fontSize=12, leading=15)
NOTE = ParagraphStyle("n", fontName="DejaVu", fontSize=7, leading=9, textColor=colors.HexColor("#333333"))


def monthly_rate(annual_pct):
    return annual_pct / 100 / 12


def coefficient(annual_pct, months):
    r = monthly_rate(annual_pct)
    return months * r / (1 - (1 + r) ** -months)


def payment_factor(annual_pct, months):
    return coefficient(annual_pct, months) / months


def fmt(x, digits=3):
    return f"{x:.{digits}f}".replace(".", ",")


def money(x):
    return f"{x:,.0f}".replace(",", " ")


def years_label(y):
    if y % 10 == 1 and y % 100 != 11:
        return f"{y} год"
    if y % 10 in (2, 3, 4) and not 12 <= y % 100 <= 14:
        return f"{y} года"
    return f"{y} лет"


def base_style(rates, first_row):
    style = [
        ("FONTNAME", (0, 0), (-1, -1), "DejaVu"),
        ("FONTSIZE", (0, 0), (-1, -1), 7),
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 1),
        ("FONTNAME", (0, 0), (-1, 0), "DejaVu-Bold"),
        ("FONTNAME", (0, first_row), (0, -1), "DejaVu-Bold"),
        ("BACKGROUND", (0, 0), (-1, first_row - 1), NAVY),
        ("TEXTCOLOR", (0, 0), (-1, first_row - 1), colors.white),
        ("BACKGROUND", (0, first_row), (0, -1), colors.HexColor("#e3e9f1")),
        ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#b8c2cc")),
        ("BOX", (0, 0), (-1, -1), 0.8, NAVY),
    ]
    for i, rate in enumerate(rates):
        row = i + first_row
        if abs(rate - round(rate)) < 1e-9:  # целые проценты — выделяем строку
            style += [("BACKGROUND", (1, row), (-1, row), colors.HexColor("#fff3cd")),
                      ("LINEABOVE", (0, row), (-1, row), 0.8, NAVY)]
        elif i % 2 == 0:
            style.append(("BACKGROUND", (1, row), (-1, row), colors.HexColor("#f6f8fa")))
    return style


def grid_pdf(path, title, cell, note, font_size=7):
    """Сетка «ставка × срок» на одной альбомной странице A4."""
    doc = SimpleDocTemplate(path, pagesize=landscape(A4), title=title,
                            leftMargin=24, rightMargin=24, topMargin=20, bottomMargin=18)
    rows = [["Ставка"] + [years_label(y) for y in YEARS],
            ["годовых"] + [f"{y * 12} мес" for y in YEARS]]
    for rate in RATES:
        rows.append([fmt(rate, 1) + " %"] + [cell(rate, y * 12) for y in YEARS])

    col_w = (doc.width - 44) / len(YEARS)
    table = Table(rows, colWidths=[44] + [col_w] * len(YEARS), rowHeights=[11, 10] + [11.6] * len(RATES))
    style = base_style(RATES, 2) + [("FONTSIZE", (1, 2), (-1, -1), font_size),
                                    ("LEFTPADDING", (1, 2), (-1, -1), 1), ("RIGHTPADDING", (1, 2), (-1, -1), 1)]
    for j, y in enumerate(YEARS):
        if y % 5 == 0:  # 10, 15, 20, 25, 30 лет — разделители
            style.append(("LINEBEFORE", (j + 1, 0), (j + 1, -1), 0.8, NAVY))
    table.setStyle(TableStyle(style))
    doc.build([Paragraph(title, TITLE), Spacer(1, 4), table, Spacer(1, 4), Paragraph(note, NOTE)])


def overpayment_pdf(path):
    k = coefficient(6.0, 240)
    grid_pdf(
        path, "Переплата по аннуитетному кредиту, % от суммы кредита",
        lambda rate, n: fmt((coefficient(rate, n) - 1) * 100, 1),
        "Значения в таблице — переплата P в процентах от суммы кредита S. "
        "P = (n·r / (1 − (1 + r)<super>−n</super>) − 1) × 100 %, где r = годовая ставка / 12, n — срок в месяцах. "
        "Переплата = S × P / 100;  общая сумма выплат = S × (1 + P / 100);  ежемесячный платёж = S × (1 + P / 100) / n. "
        f"Пример: 4 600 000 ₽ под 6,0 % на 20 лет → P = {fmt((k - 1) * 100, 1)} %, "
        f"выплаты ≈ {money(4_600_000 * k)} ₽, переплата ≈ {money(4_600_000 * (k - 1))} ₽.")


def payment_pdf(path):
    a = payment_factor(6.0, 240)
    grid_pdf(
        path, "Множитель ежемесячного платежа: платёж = сумма кредита × A",
        lambda rate, n: fmt(payment_factor(rate, n), 6),
        "Значения в таблице — множитель A: ежемесячный платёж = S × A, где S — сумма кредита. "
        "A = r / (1 − (1 + r)<super>−n</super>), где r = годовая ставка / 12, n — срок в месяцах. "
        f"Пример: 4 600 000 под 6,0 % на 20 лет → A = {fmt(a, 6)}, платёж = 4 600 000 × {fmt(a, 6)} ≈ {money(4_600_000 * a)} в месяц. "
        "Общая сумма выплат = S × A × n.",
        font_size=6.3)


def monthly_rate_pdf(path):
    doc = SimpleDocTemplate(path, pagesize=A4, title="Месячная ставка и проценты банку",
                            leftMargin=50, rightMargin=50, topMargin=28, bottomMargin=24)
    rows = [["Годовая ставка", "Месячная ставка\n(= годовая / 12)",
             "Множитель r: проценты\nза месяц = остаток × r"]]
    for rate in RATES:
        r = monthly_rate(rate)
        rows.append([fmt(rate, 1) + " %", fmt(r * 100, 4) + " %", fmt(r, 6)])
    table = Table(rows, colWidths=[110, 150, 170], rowHeights=[26] + [15.5] * len(RATES))
    style = base_style(RATES, 1) + [("FONTSIZE", (0, 0), (-1, -1), 9), ("LEADING", (0, 0), (-1, 0), 11)]
    table.setStyle(TableStyle(style))

    first = MILLION * payment_factor(6.0, 360)
    note = ParagraphStyle("n2", parent=NOTE, fontSize=8.5, leading=11)
    doc.build([
        Paragraph("Месячная ставка: какую часть остатка долга вы платите банку каждый месяц", TITLE),
        Spacer(1, 6),
        table,
        Spacer(1, 8),
        Paragraph(
            "Проценты за месяц = текущий остаток долга × r. Остальная часть ежемесячного платежа идёт в погашение долга, "
            "поэтому остаток уменьшается, и доля процентов в платеже со временем падает, хотя сам платёж (аннуитет) не меняется. "
            f"Пример: 1 000 000 под 6,0 % на 30 лет → платёж 1 000 000 × {fmt(payment_factor(6.0, 360), 6)} ≈ {money(first)}; в первый месяц "
            f"1 000 000 × 0,005 = {money(MILLION * monthly_rate(6.0))} уходит банку, "
            f"{money(first - MILLION * monthly_rate(6.0))} — в погашение долга.", note),
    ])


if __name__ == "__main__":
    out = sys.argv[1] if len(sys.argv) > 1 else "."
    overpayment_pdf(os.path.join(out, "overpayment_table.pdf"))
    payment_pdf(os.path.join(out, "payment_table.pdf"))
    monthly_rate_pdf(os.path.join(out, "monthly_rate_table.pdf"))
