"""
IEEE 5G Core Testbed — PDF Document Generator
Generates Administrator Guide and Installation Guide using ReportLab.
"""

import os
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    PageBreak, HRFlowable, KeepTogether
)
from reportlab.platypus.flowables import Flowable
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm, cm
from reportlab.lib.colors import HexColor, white, black
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_RIGHT, TA_JUSTIFY
from reportlab.lib import colors

# ── Colour palette ─────────────────────────────────────────────────────────────
NAVY        = HexColor('#1e3a5f')
GREEN       = HexColor('#1a5f3a')
CODE_BG     = HexColor('#f4f4f4')
INFO_BG     = HexColor('#e8f0fe')
INFO_BORDER = HexColor('#3b82f6')
WARN_BG     = HexColor('#fef3c7')
WARN_BORDER = HexColor('#f59e0b')
ALT_ROW     = HexColor('#f8f9fa')
LIGHT_GREY  = HexColor('#cccccc')
DARK_TEXT   = HexColor('#1a1a1a')

PAGE_W, PAGE_H = A4
MARGIN = 2 * cm

# ── Custom flowables ────────────────────────────────────────────────────────────

class ColoredBox(Flowable):
    """A paragraph inside a coloured box with a left accent border."""
    def __init__(self, text, bg_color, border_color, style, padding=8):
        Flowable.__init__(self)
        self.text = text
        self.bg_color = bg_color
        self.border_color = border_color
        self.style = style
        self.padding = padding
        self._para = None

    def _build_para(self, avail_width):
        inner_w = avail_width - 2 * self.padding - 6  # 6 = border width
        self._para = Paragraph(self.text, self.style)
        self._para_w, self._para_h = self._para.wrap(inner_w, 9999)
        return self._para_h + 2 * self.padding

    def wrap(self, avail_width, avail_height):
        self.width = avail_width
        self.height = self._build_para(avail_width)
        return self.width, self.height

    def draw(self):
        c = self.canv
        h = self.height
        w = self.width
        # Background
        c.setFillColor(self.bg_color)
        c.rect(0, 0, w, h, fill=1, stroke=0)
        # Left border
        c.setFillColor(self.border_color)
        c.rect(0, 0, 4, h, fill=1, stroke=0)
        # Text
        self._para.drawOn(c, 4 + self.padding, self.padding)


class CodeBlock(Flowable):
    """Monospaced code block with grey background."""
    def __init__(self, text, font_size=8):
        Flowable.__init__(self)
        self.text = text
        self.font_size = font_size
        self.padding = 8
        self.line_height = font_size * 1.4
        self._lines = text.split('\n')

    def wrap(self, avail_width, avail_height):
        self.width = avail_width
        self.height = len(self._lines) * self.line_height + 2 * self.padding
        return self.width, self.height

    def draw(self):
        c = self.canv
        h = self.height
        w = self.width
        # Background
        c.setFillColor(CODE_BG)
        c.setStrokeColor(LIGHT_GREY)
        c.roundRect(0, 0, w, h, 3, fill=1, stroke=1)
        # Code text
        c.setFillColor(DARK_TEXT)
        c.setFont('Courier', self.font_size)
        y = h - self.padding - self.font_size
        for line in self._lines:
            c.drawString(self.padding, y, line)
            y -= self.line_height


class TitlePageFlowable(Flowable):
    """Full-page title block."""
    def __init__(self, title, subtitle, version_str, accent_color, footer_text):
        Flowable.__init__(self)
        self.title = title
        self.subtitle = subtitle
        self.version_str = version_str
        self.accent = accent_color
        self.footer_text = footer_text

    def wrap(self, avail_width, avail_height):
        self.width = avail_width
        self.height = avail_height
        return self.width, self.height

    def draw(self):
        c = self.canv
        w, h = self.width, self.height

        # Dark header band
        band_h = h * 0.45
        c.setFillColor(self.accent)
        c.rect(0, h - band_h, w, band_h, fill=1, stroke=0)

        # White accent stripe
        c.setFillColor(white)
        c.rect(0, h - band_h - 4, w, 4, fill=1, stroke=0)

        # Title text (white, in header band)
        c.setFillColor(white)
        c.setFont('Helvetica-Bold', 26)
        # Word-wrap title manually
        lines = self._wrap_text(c, self.title, 'Helvetica-Bold', 26, w - 40)
        y = h - band_h * 0.30
        for line in lines:
            c.drawCentredString(w / 2, y, line)
            y -= 36

        # Subtitle
        c.setFont('Helvetica', 14)
        sub_lines = self._wrap_text(c, self.subtitle, 'Helvetica', 14, w - 40)
        y -= 10
        for line in sub_lines:
            c.drawCentredString(w / 2, y, line)
            y -= 22

        # Version badge (below white stripe)
        c.setFillColor(self.accent)
        badge_y = h - band_h - 60
        c.roundRect(w/2 - 120, badge_y, 240, 34, 6, fill=1, stroke=0)
        c.setFillColor(white)
        c.setFont('Helvetica-Bold', 12)
        c.drawCentredString(w / 2, badge_y + 10, self.version_str)

        # Decorative horizontal line
        c.setStrokeColor(self.accent)
        c.setLineWidth(1)
        c.line(40, badge_y - 30, w - 40, badge_y - 30)

        # Footer on title page
        c.setFillColor(HexColor('#555555'))
        c.setFont('Helvetica-Oblique', 8)
        c.drawCentredString(w / 2, 20, self.footer_text)

    def _wrap_text(self, c, text, font, size, max_w):
        words = text.split()
        lines = []
        current = ''
        for word in words:
            test = (current + ' ' + word).strip()
            if c.stringWidth(test, font, size) <= max_w:
                current = test
            else:
                if current:
                    lines.append(current)
                current = word
        if current:
            lines.append(current)
        return lines


# ── Style factory ───────────────────────────────────────────────────────────────

def make_styles(accent_color):
    base = getSampleStyleSheet()

    styles = {
        'body': ParagraphStyle(
            'Body',
            parent=base['Normal'],
            fontName='Helvetica',
            fontSize=10,
            leading=15,
            spaceAfter=6,
            textColor=DARK_TEXT,
            alignment=TA_JUSTIFY,
        ),
        'heading1': ParagraphStyle(
            'H1',
            parent=base['Heading1'],
            fontName='Helvetica-Bold',
            fontSize=14,
            leading=18,
            spaceBefore=18,
            spaceAfter=6,
            textColor=accent_color,
            borderPad=0,
        ),
        'heading2': ParagraphStyle(
            'H2',
            parent=base['Heading2'],
            fontName='Helvetica-Bold',
            fontSize=11,
            leading=15,
            spaceBefore=12,
            spaceAfter=4,
            textColor=accent_color,
        ),
        'info_text': ParagraphStyle(
            'InfoText',
            parent=base['Normal'],
            fontName='Helvetica',
            fontSize=9,
            leading=13,
            textColor=DARK_TEXT,
        ),
        'warn_text': ParagraphStyle(
            'WarnText',
            parent=base['Normal'],
            fontName='Helvetica-Bold',
            fontSize=9,
            leading=13,
            textColor=HexColor('#7c4a00'),
        ),
        'numbered': ParagraphStyle(
            'Numbered',
            parent=base['Normal'],
            fontName='Helvetica',
            fontSize=10,
            leading=15,
            spaceAfter=4,
            textColor=DARK_TEXT,
            leftIndent=16,
        ),
        'bullet': ParagraphStyle(
            'Bullet',
            parent=base['Normal'],
            fontName='Helvetica',
            fontSize=10,
            leading=15,
            spaceAfter=3,
            textColor=DARK_TEXT,
            leftIndent=16,
            bulletIndent=4,
        ),
        'toc_title': ParagraphStyle(
            'TOCTitle',
            fontName='Helvetica-Bold',
            fontSize=16,
            leading=20,
            spaceAfter=12,
            textColor=accent_color,
        ),
        'step_heading': ParagraphStyle(
            'StepHeading',
            fontName='Helvetica-Bold',
            fontSize=10,
            leading=14,
            spaceBefore=10,
            spaceAfter=4,
            textColor=accent_color,
        ),
        'url': ParagraphStyle(
            'URL',
            parent=base['Normal'],
            fontName='Courier',
            fontSize=9,
            leading=14,
            textColor=INFO_BORDER,
        ),
    }
    return styles


# ── Helper builders ─────────────────────────────────────────────────────────────

def section_heading(text, styles, level=1):
    key = 'heading1' if level == 1 else 'heading2'
    return [
        Paragraph(text, styles[key]),
        HRFlowable(width='100%', thickness=1,
                   color=styles[key].textColor, spaceAfter=6),
    ]


def body_para(text, styles):
    return Paragraph(text, styles['body'])


def bullet_item(text, styles):
    return Paragraph(f'\u2022  {text}', styles['bullet'])


def numbered_item(n, text, styles):
    return Paragraph(f'<b>{n}.</b>  {text}', styles['numbered'])


def code_block(text):
    return [CodeBlock(text), Spacer(1, 6)]


def info_box(text, styles):
    return [ColoredBox(text, INFO_BG, INFO_BORDER, styles['info_text']), Spacer(1, 8)]


def warning_box(text, styles):
    return [ColoredBox(
        f'\u26a0  <b>Warning:</b> {text}', WARN_BG, WARN_BORDER, styles['warn_text']
    ), Spacer(1, 8)]


def two_col_table(data, accent_color, col_widths=None):
    """data: list of [header_row, row1, row2, ...]"""
    avail = PAGE_W - 2 * MARGIN
    if col_widths is None:
        col_widths = [avail * 0.35, avail * 0.65]

    style = TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), accent_color),
        ('TEXTCOLOR', (0, 0), (-1, 0), white),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, 0), 10),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 8),
        ('TOPPADDING', (0, 0), (-1, 0), 8),
        ('FONTNAME', (0, 1), (-1, -1), 'Helvetica'),
        ('FONTSIZE', (0, 1), (-1, -1), 9),
        ('TOPPADDING', (0, 1), (-1, -1), 6),
        ('BOTTOMPADDING', (0, 1), (-1, -1), 6),
        ('LEFTPADDING', (0, 0), (-1, -1), 8),
        ('RIGHTPADDING', (0, 0), (-1, -1), 8),
        ('GRID', (0, 0), (-1, -1), 0.5, LIGHT_GREY),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [white, ALT_ROW]),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
    ])
    t = Table(data, colWidths=col_widths)
    t.setStyle(style)
    return [t, Spacer(1, 10)]


def three_col_table(data, accent_color, col_widths=None):
    avail = PAGE_W - 2 * MARGIN
    if col_widths is None:
        col_widths = [avail * 0.30, avail * 0.35, avail * 0.35]

    style = TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), accent_color),
        ('TEXTCOLOR', (0, 0), (-1, 0), white),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, 0), 10),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 8),
        ('TOPPADDING', (0, 0), (-1, 0), 8),
        ('FONTNAME', (0, 1), (-1, -1), 'Helvetica'),
        ('FONTSIZE', (0, 1), (-1, -1), 9),
        ('TOPPADDING', (0, 1), (-1, -1), 6),
        ('BOTTOMPADDING', (0, 1), (-1, -1), 6),
        ('LEFTPADDING', (0, 0), (-1, -1), 8),
        ('RIGHTPADDING', (0, 0), (-1, -1), 8),
        ('GRID', (0, 0), (-1, -1), 0.5, LIGHT_GREY),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [white, ALT_ROW]),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('WORDWRAP', (0, 0), (-1, -1), 'CJK'),
    ])
    t = Table(data, colWidths=col_widths)
    t.setStyle(style)
    return [t, Spacer(1, 10)]


# ── Page template callbacks ─────────────────────────────────────────────────────

def make_page_callbacks(footer_text, accent_color):
    def on_first_page(canvas, doc):
        pass  # Title page handled by TitlePageFlowable

    def on_later_pages(canvas, doc):
        canvas.saveState()
        w = PAGE_W
        # Header bar
        canvas.setFillColor(accent_color)
        canvas.rect(0, PAGE_H - 1.2 * cm, w, 1.2 * cm, fill=1, stroke=0)
        canvas.setFillColor(white)
        canvas.setFont('Helvetica-Bold', 9)
        canvas.drawString(MARGIN, PAGE_H - 0.85 * cm, 'IEEE 5G Core Testbed')
        canvas.setFont('Helvetica', 9)
        canvas.drawRightString(w - MARGIN, PAGE_H - 0.85 * cm,
                               f'Page {doc.page}')

        # Footer
        canvas.setStrokeColor(LIGHT_GREY)
        canvas.setLineWidth(0.5)
        canvas.line(MARGIN, 1.5 * cm, w - MARGIN, 1.5 * cm)
        canvas.setFillColor(HexColor('#555555'))
        canvas.setFont('Helvetica-Oblique', 8)
        canvas.drawCentredString(w / 2, 0.8 * cm, footer_text)
        canvas.restoreState()

    return on_first_page, on_later_pages


# ══════════════════════════════════════════════════════════════════════════════
#  ADMIN GUIDE
# ══════════════════════════════════════════════════════════════════════════════

def build_admin_guide(out_path):
    accent = NAVY
    footer = 'IEEE 5G Core Testbed — CONFIDENTIAL — Administrator Use Only'
    S = make_styles(accent)
    on_first, on_later = make_page_callbacks(footer, accent)

    doc = SimpleDocTemplate(
        out_path,
        pagesize=A4,
        leftMargin=MARGIN, rightMargin=MARGIN,
        topMargin=1.5 * cm, bottomMargin=2 * cm,
        title='IEEE 5G Core Testbed — Administrator Guide',
        author='IEEE 5G Core Testbed',
    )

    story = []

    # ── Title page ──────────────────────────────────────────────────────────
    story.append(TitlePageFlowable(
        title='IEEE 5G Core Testbed\nAdministrator Guide',
        subtitle='Package Generation, License Issuance & Deployment Management',
        version_str='Version 1.0  |  March 2026',
        accent_color=accent,
        footer_text=footer,
    ))
    story.append(PageBreak())

    # ── Section 1: Overview ─────────────────────────────────────────────────
    story += section_heading('1. Overview', S)
    story.append(body_para(
        'This guide is for system administrators responsible for issuing licenses and '
        'deploying the IEEE 5G Core Testbed platform. The platform is built on Open5GS '
        'running on k3s Kubernetes, managed via a web-based UI. Licenses are '
        'cluster-locked using JWT tokens signed with RSA-2048.', S))
    story.append(Spacer(1, 10))

    # ── Section 2: Architecture Overview ───────────────────────────────────
    story += section_heading('2. Architecture Overview', S)
    story.append(body_para(
        'The license issuance architecture follows a hub-and-spoke model. '
        'The administrator holds the RSA-2048 private key and signs all license JWTs. '
        'Each deployment site receives a self-contained package and a site-specific '
        'license. The backend validates the license on every startup.', S))
    story.append(Spacer(1, 6))

    arch_data = [
        ['Component', 'Description'],
        ['Admin (you)', 'Holds RSA-2048 private key — signs license JWTs'],
        ['Deployment package', 'ieee_5g_core_deploy_v{version}.tar.gz (~5 KB)'],
        ['License file', '{site}-license.jwt — cluster-locked JWT'],
        ['bootstrap.sh', 'Clones from GitHub, runs install.sh, places license'],
        ['Backend startup check', 'Verifies JWT signature + k3s cluster UID on every boot'],
    ]
    story += two_col_table(arch_data, accent)
    story.append(Spacer(1, 6))

    # ── Section 3: Prerequisites ────────────────────────────────────────────
    story += section_heading('3. Prerequisites', S)
    prereq_data = [
        ['Requirement', 'Details'],
        ['Node.js', 'v18 or later (for generate-license.js)'],
        ['OpenSSL', 'For key pair generation'],
        ['Git', 'Access to ieee-testbed/ieee_5g_core repo'],
        ['Private key', 'scripts/license-private.pem (never share)'],
    ]
    story += two_col_table(prereq_data, accent)

    # ── Section 4: One-Time Setup ───────────────────────────────────────────
    story += section_heading('4. One-Time Setup: Generate RSA Key Pair', S)
    story.append(body_para(
        'Run once. The private key must be kept secure — never committed to git, '
        'never shared.', S))
    story += code_block('cd ieee_5g_core\nbash scripts/generate-keypair.sh')
    story.append(body_para('<b>Output — two files are created:</b>', S))
    story.append(bullet_item(
        '<b>scripts/license-private.pem</b>  →  KEEP SECRET. '
        'Store in secure vault (e.g. 1Password, AWS Secrets Manager)', S))
    story.append(bullet_item(
        '<b>ui/backend/src/license-public.pem</b>  →  Commit to repository. '
        'Bundled in the backend binary.', S))
    story.append(Spacer(1, 6))
    story += warning_box(
        'The private key cannot be recovered if lost. Losing it means you cannot '
        'issue new licenses. Back it up immediately in a secure location.', S)

    # ── Section 5: Issuing a License ───────────────────────────────────────
    story += section_heading('5. Issuing a License', S)

    story.append(Paragraph('<b>Step 1 — Receive cluster UID from site</b>', S['step_heading']))
    story += info_box(
        'Ask the site admin to run the following command on their server AFTER k3s '
        'is installed, and send you the output:', S)
    story += code_block(
        "kubectl get namespace kube-system \\\n"
        "  -o jsonpath='{.metadata.uid}'"
    )
    story.append(body_para(
        '<b>Example output:</b>  a3f7c821-4b2e-11ef-9a1d-00163e002a4b', S))
    story.append(Spacer(1, 8))

    story.append(Paragraph('<b>Step 2 — Generate the license</b>', S['step_heading']))
    story += code_block(
        "node scripts/generate-license.js \\\n"
        "  --cluster-id  a3f7c821-4b2e-11ef-9a1d-00163e002a4b \\\n"
        "  --institution \"University of Sfax\" \\\n"
        "  --features    multus,tracing,gnb_mgmt \\\n"
        "  --max-gnbs    10 \\\n"
        "  --days        365 \\\n"
        "  --out         sfax-license.jwt"
    )

    story.append(body_para('<b>Feature flags:</b>', S))
    feat_data = [
        ['Feature Flag', 'Enables'],
        ['multus', 'Networking / Multus CNI management tab'],
        ['tracing', 'Packet capture & NGAP tracing'],
        ['gnb_mgmt', 'gNB registry, SCTP association view'],
        ['all', 'All current and future features'],
    ]
    story += two_col_table(feat_data, accent)

    story.append(Paragraph('<b>Step 3 — Deliver to site</b>', S['step_heading']))
    story.append(body_para(
        'Send the following two files to the site administrator via secure channel '
        '(encrypted email or secure file share):', S))
    story.append(bullet_item('ieee_5g_core_deploy_v{version}.tar.gz', S))
    story.append(bullet_item('{site}-license.jwt', S))
    story.append(Spacer(1, 8))

    # ── Section 6: Building the Package ────────────────────────────────────
    story += section_heading('6. Building the Deployment Package', S)
    story += code_block(
        'cd ieee_5g_core\n'
        'bash scripts/package.sh\n'
        '# Output: ieee_5g_core_deploy_v{git-tag}.tar.gz'
    )
    story += info_box(
        'The package contains only bootstrap.sh and README.txt (~5 KB). All Kubernetes '
        'manifests and application code are pulled from GitHub at deploy time. '
        'Ensure the repo is accessible from the deployment site.', S)

    # ── Section 7: License Renewal ──────────────────────────────────────────
    story += section_heading('7. License Renewal', S)
    story.append(body_para(
        'Licenses expire based on the <b>--days</b> parameter. The backend warns '
        '30 days before expiry in the UI footer. To renew:', S))
    story.append(numbered_item(1,
        'Run generate-license.js with the same <b>cluster-id</b> and a new <b>--days</b> value', S))
    story.append(numbered_item(2, 'Send the new license.jwt to the site', S))
    story.append(numbered_item(3,
        'Site admin replaces /etc/ieee5g/license.jwt and restarts the backend:', S))
    story += code_block(
        'sudo cp new-license.jwt /etc/ieee5g/license.jwt\n'
        'kubectl rollout restart deployment/core-ui -n open5gs'
    )

    # ── Section 8: Revoking a License ──────────────────────────────────────
    story += section_heading('8. Revoking a License', S)
    story.append(body_para(
        'To revoke access, simply do not renew the license when it expires. '
        'If immediate revocation is needed:', S))
    story.append(bullet_item(
        'Issue a replacement license with <b>--days 0</b> (expires immediately)', S))
    story.append(bullet_item(
        'Or: contact the site to delete <b>/etc/ieee5g/license.jwt</b> and restart core-ui', S))
    story.append(Spacer(1, 8))

    # ── Section 9: Tracking Deployments ────────────────────────────────────
    story += section_heading('9. Tracking Deployments', S)
    story.append(body_para(
        'Maintain a deployment registry (spreadsheet or CRM) with the following fields:', S))
    track_data = [
        ['Field', 'Example'],
        ['Institution', 'University of Tunis, Sfax, …'],
        ['Cluster UID', 'a3f7c821-4b2e-11ef-9a1d-00163e002a4b'],
        ['Issued date', '2026-03-18'],
        ['Expiry date', '2027-03-18'],
        ['Features', 'multus, tracing'],
        ['Max gNBs', '10'],
        ['License file', 'sfax-license.jwt'],
    ]
    story += two_col_table(track_data, accent)

    # ── Section 10: Troubleshooting ─────────────────────────────────────────
    story += section_heading('10. Troubleshooting', S)
    ts_data = [
        ['Problem', 'Likely Cause', 'Fix'],
        ['"License not found"', 'File missing',
         'Place license.jwt at /etc/ieee5g/license.jwt'],
        ['"Invalid signature"', 'Wrong public key in build',
         'Regenerate keypair, rebuild backend'],
        ['"Not valid for this cluster"', 'Wrong cluster UID',
         'Re-issue license with correct UID'],
        ['"License expired"', 'Past expiry date',
         'Issue renewal license'],
        ['API returns 403', 'Backend in unlicensed mode',
         'Check: kubectl logs deploy/core-ui -n open5gs'],
    ]
    story += three_col_table(ts_data, accent,
        col_widths=[(PAGE_W - 2*MARGIN)*0.28,
                    (PAGE_W - 2*MARGIN)*0.28,
                    (PAGE_W - 2*MARGIN)*0.44])

    doc.build(story,
              onFirstPage=on_first,
              onLaterPages=on_later)
    print(f'[OK] Admin guide written: {out_path}  ({os.path.getsize(out_path):,} bytes)')


# ══════════════════════════════════════════════════════════════════════════════
#  INSTALLATION GUIDE
# ══════════════════════════════════════════════════════════════════════════════

def build_installation_guide(out_path):
    accent = GREEN
    footer = 'IEEE 5G Core Testbed — Site Installation Guide'
    S = make_styles(accent)
    on_first, on_later = make_page_callbacks(footer, accent)

    doc = SimpleDocTemplate(
        out_path,
        pagesize=A4,
        leftMargin=MARGIN, rightMargin=MARGIN,
        topMargin=1.5 * cm, bottomMargin=2 * cm,
        title='IEEE 5G Core Testbed — Installation Guide',
        author='IEEE 5G Core Testbed',
    )

    story = []

    # ── Title page ──────────────────────────────────────────────────────────
    story.append(TitlePageFlowable(
        title='IEEE 5G Core Testbed\nInstallation Guide',
        subtitle='Site Deployment & First-Time Setup',
        version_str='Version 1.0  |  March 2026',
        accent_color=accent,
        footer_text=footer,
    ))
    story.append(PageBreak())

    # ── Section 1: Overview ─────────────────────────────────────────────────
    story += section_heading('1. Overview', S)
    story.append(body_para(
        'This guide walks you through deploying the IEEE 5G Core Testbed platform '
        'on your server. The platform deploys Open5GS 5G Core network functions on a '
        'lightweight Kubernetes cluster (k3s), managed through a web-based dashboard. '
        'A valid license file (license.jwt) issued by your IEEE coordinator is required.', S))
    story.append(Spacer(1, 10))

    # ── Section 2: System Requirements ─────────────────────────────────────
    story += section_heading('2. System Requirements', S)
    req_data = [
        ['Component', 'Minimum', 'Recommended'],
        ['OS', 'Ubuntu 22.04 LTS', 'Ubuntu 24.04 LTS'],
        ['CPU', '4 vCPU', '8 vCPU'],
        ['RAM', '8 GB', '16 GB'],
        ['Disk', '50 GB SSD', '100 GB SSD'],
        ['Network', '1 NIC (management)', '3 NICs (mgmt + RAN + DN)'],
        ['Internet', 'Required (for initial setup)', '—'],
    ]
    story += three_col_table(req_data, accent)
    story += info_box(
        'For Multus multi-interface support (N2/N3/N4/N6 separation), your server '
        'needs at least 2 physical or virtual NICs. A single NIC setup is supported '
        'but routes all traffic through one interface.', S)

    # ── Section 3: What You Need Before Starting ────────────────────────────
    story += section_heading('3. What You Need Before Starting', S)
    story.append(numbered_item(1,
        'The deployment package: <b>ieee_5g_core_deploy_vX.X.tar.gz</b> '
        '(from your IEEE coordinator)', S))
    story.append(numbered_item(2,
        'Your license file: <b>license.jwt</b> (from your IEEE coordinator)', S))
    story.append(numbered_item(3, 'Root/sudo access on the target server', S))
    story.append(numbered_item(4,
        'Internet access from the server (GitHub + container registries)', S))
    story.append(Spacer(1, 10))

    # ── Section 4: Get Your Cluster UID ────────────────────────────────────
    story += section_heading('4. Get Your Cluster UID (for License)', S)
    story += info_box(
        "If you don't have a license.jwt yet, complete steps 5.1–5.2 first to install "
        'k3s, then send your cluster UID to your IEEE coordinator.', S)
    story += code_block(
        '# After k3s is installed:\n'
        'kubectl get namespace kube-system \\\n'
        "  -o jsonpath='{.metadata.uid}'"
    )
    story.append(body_para(
        'Send this value to your IEEE coordinator to receive your license.jwt.', S))
    story.append(Spacer(1, 10))

    # ── Section 5: Installation Steps ──────────────────────────────────────
    story += section_heading('5. Installation Steps', S)

    story.append(Paragraph('<b>Step 1 — Transfer files to your server</b>', S['step_heading']))
    story += code_block(
        'scp ieee_5g_core_deploy_v1.0.tar.gz user@your-server:~\n'
        'scp license.jwt user@your-server:~'
    )

    story.append(Paragraph('<b>Step 2 — Extract the package</b>', S['step_heading']))
    story += code_block(
        'tar -xzf ieee_5g_core_deploy_v1.0.tar.gz\n'
        'cd ieee_5g_core_deploy_v1.0'
    )

    story.append(Paragraph('<b>Step 3 — Run bootstrap (installs everything)</b>', S['step_heading']))
    story += code_block('bash bootstrap.sh ~/license.jwt')
    story += info_box(
        'bootstrap.sh will:\n'
        '  1. Verify prerequisites (git, curl, kubectl)\n'
        '  2. Clone the full platform from GitHub\n'
        '  3. Install k3s and system dependencies (~5 minutes)\n'
        '  4. Install your license at /etc/ieee5g/license.jwt\n'
        '  5. Deploy all 5G Core NFs via kubectl apply\n'
        '  6. Wait for all pods to be ready', S)
    story += warning_box(
        'Do not interrupt the bootstrap process. If it fails midway, check the '
        'error message and re-run. It is safe to run multiple times.', S)

    story.append(Paragraph('<b>Step 4 — Verify installation</b>', S['step_heading']))
    story += code_block(
        '# All pods should show Running\n'
        'kubectl get pods -n open5gs\n'
        '\n'
        '# Expected output:\n'
        '# NAME                    READY   STATUS    RESTARTS\n'
        '# nrf-xxx                 1/1     Running   0\n'
        '# ausf-xxx                1/1     Running   0\n'
        '# udm-xxx                 1/1     Running   0\n'
        '# amf-xxx                 1/1     Running   0\n'
        '# smf-xxx                 1/1     Running   0\n'
        '# upf-xxx                 1/1     Running   0\n'
        '# core-ui-xxx             1/1     Running   0'
    )

    story.append(Paragraph('<b>Step 5 — Access the dashboard</b>', S['step_heading']))
    story += code_block(
        'kubectl port-forward svc/core-ui-svc 8080:80 -n open5gs'
    )
    story.append(body_para(
        'Then open your browser at: <b>http://localhost:8080</b>', S))
    story.append(body_para('<b>Default credentials:</b>', S))
    story.append(bullet_item('Username: admin', S))
    story.append(bullet_item('Password: admin123', S))
    story.append(Spacer(1, 4))
    story += warning_box(
        'Change the default password immediately after first login via '
        'Settings → Users.', S)

    # ── Section 6: Multus / Network Interfaces ──────────────────────────────
    story += section_heading('6. Network Interface Configuration (Multus)', S)
    story.append(body_para(
        'If your license includes the <b>multus</b> feature and you have multiple '
        'NICs, configure the network interfaces through the dashboard:', S))
    story.append(numbered_item(1, 'Log in to the dashboard', S))
    story.append(numbered_item(2, 'Navigate to <b>Networking</b> in the left sidebar', S))
    story.append(numbered_item(3,
        'For each interface card (N2, N3, N4, N6), click the edit icon (pencil)', S))
    story.append(numbered_item(4,
        'Set the <b>Host NIC</b> to your actual interface name '
        '(run: <font name="Courier">ip link show</font>)', S))
    story.append(numbered_item(5,
        'Save — the dashboard will prompt you to restart affected pods', S))
    story.append(Spacer(1, 6))
    story += info_box(
        'Common NIC names:\n'
        '  eth0, eth1, eth2       (older systems)\n'
        '  ens3, ens4, ens5       (newer systems)\n'
        '  enp3s0, enp4s0        (PCI-named)\n'
        '  bond0, bond0.100       (bonded/VLAN)', S)

    # ── Section 7: Connecting gNBs ──────────────────────────────────────────
    story += section_heading('7. Connecting gNBs', S)
    story.append(body_para(
        'Once the core is running, configure your gNodeBs (srsRAN, OAI, etc.) '
        'to connect to the AMF using the parameters below:', S))
    gnb_data = [
        ['Parameter', 'Value'],
        ['AMF IP (N2)', '192.168.10.10 (Multus) or AMF pod IP'],
        ['AMF Port', '38412'],
        ['Protocol', 'SCTP'],
        ['MCC', '001'],
        ['MNC', '01'],
        ['TAC', '1'],
    ]
    story += two_col_table(gnb_data, accent)
    story.append(body_para('<b>srsRAN configuration example (gnb.yaml):</b>', S))
    story += code_block(
        '# gnb.yaml\n'
        'amf:\n'
        '  addr: 192.168.10.10\n'
        '  port: 38412\n'
        'plmn_list:\n'
        '  - plmn: "00101"\n'
        '    tac: 1'
    )

    # ── Section 8: License Status ────────────────────────────────────────────
    story += section_heading('8. License Status', S)
    story.append(body_para(
        'The license status is shown in the dashboard footer. You will see:', S))
    story.append(bullet_item(
        '<b>Green:</b> Licensed to {institution} · expires in N days', S))
    story.append(bullet_item(
        '<b>Amber:</b> ⚠ License expires in N days — contact your coordinator', S))
    story.append(bullet_item(
        '<b>Red:</b> License expired — contact your IEEE coordinator immediately', S))
    story.append(Spacer(1, 10))

    # ── Section 9: Troubleshooting ──────────────────────────────────────────
    story += section_heading('9. Troubleshooting', S)
    ts_data = [
        ['Symptom', 'Check', 'Fix'],
        ['Pods stuck in Pending', 'kubectl describe pod',
         'Check node resources, taints'],
        ['UPF not running', 'kubectl logs deploy/upf',
         'TUN device, NET_ADMIN permission'],
        ['AMF not ready', 'kubectl logs deploy/amf',
         'NRF reachability, config errors'],
        ['Dashboard shows 403', 'kubectl logs deploy/core-ui',
         'License file missing or expired'],
        ['gNB can\'t connect', 'AMF logs, firewall',
         'Port 38412/SCTP open, correct IP'],
        ['License error on login', '/api/license endpoint',
         'Check /etc/ieee5g/license.jwt'],
    ]
    story += three_col_table(ts_data, accent,
        col_widths=[(PAGE_W - 2*MARGIN)*0.28,
                    (PAGE_W - 2*MARGIN)*0.30,
                    (PAGE_W - 2*MARGIN)*0.42])

    # ── Section 10: Useful Commands ─────────────────────────────────────────
    story += section_heading('10. Useful Commands', S)
    story += code_block(
        '# Check all pods\n'
        'kubectl get pods -n open5gs\n'
        '\n'
        '# View logs for a specific NF\n'
        'kubectl logs -f deploy/amf -n open5gs\n'
        '\n'
        '# Restart a specific NF\n'
        'kubectl rollout restart deploy/smf -n open5gs\n'
        '\n'
        '# Check license status\n'
        'curl http://localhost:8080/api/license\n'
        '\n'
        "# Get cluster UID (for license renewal)\n"
        "kubectl get ns kube-system -o jsonpath='{.metadata.uid}'"
    )

    # ── Section 11: Support ─────────────────────────────────────────────────
    story += section_heading('11. Support', S)
    story.append(bullet_item(
        'GitHub Issues: https://github.com/ieee-testbed/ieee_5g_core/issues', S))
    story.append(bullet_item(
        'For license issues, contact your IEEE coordinator with your cluster UID', S))
    story.append(bullet_item(
        'For deployment issues, include output of:\n'
        '<font name="Courier" size="9">kubectl get pods -n open5gs '
        '&amp;&amp; kubectl get events -n open5gs</font>', S))

    doc.build(story,
              onFirstPage=on_first,
              onLaterPages=on_later)
    print(f'[OK] Installation guide written: {out_path}  ({os.path.getsize(out_path):,} bytes)')


# ══════════════════════════════════════════════════════════════════════════════
#  ENTRY POINT
# ══════════════════════════════════════════════════════════════════════════════

if __name__ == '__main__':
    out_dir = r'C:\Users\nares\claude\5gTestbed\Tunisia 5G Core\ieee_5g_core\docs'
    os.makedirs(out_dir, exist_ok=True)

    admin_path  = os.path.join(out_dir, 'ieee_5g_core_admin_guide.pdf')
    install_path = os.path.join(out_dir, 'ieee_5g_core_installation_guide.pdf')

    print('Generating PDF documents...')
    print()
    build_admin_guide(admin_path)
    build_installation_guide(install_path)
    print()
    print('Both PDFs generated successfully.')
