"""
ocrmypdf plugin: Google Cloud Vision API OCR Engine
Google Vision API로 OCR을 수행하고, 결과를 hOCR 포맷으로 변환하여
ocrmypdf가 검색 가능한 PDF 텍스트 레이어를 생성하도록 합니다.
"""

import base64
import os
from collections import namedtuple
from pathlib import Path

import requests
from ocrmypdf import OcrEngine, hookimpl

OrientationConfidence = namedtuple("OrientationConfidence", ["angle", "confidence"])


class GoogleVisionOcrEngine(OcrEngine):
    """Google Cloud Vision API를 사용하는 OCR 엔진"""

    @staticmethod
    def __str__():
        return "Google Cloud Vision API"

    @staticmethod
    def creator_tag(options):
        return "Google Cloud Vision API"

    @staticmethod
    def version():
        return "1.0.0"

    @staticmethod
    def languages(options):
        return {"eng", "kor", "jpn", "chi_sim", "chi_tra"}

    @staticmethod
    def get_orientation(input_file, options):
        return OrientationConfidence(angle=0, confidence=0.0)

    @staticmethod
    def generate_hocr(input_file, output_hocr, output_text, options):
        api_key = os.environ.get("GOOGLE_VISION_API_KEY")
        if not api_key:
            raise RuntimeError("GOOGLE_VISION_API_KEY 환경변수가 설정되지 않았습니다")

        # 이미지 파일을 Base64로 인코딩
        with open(input_file, "rb") as f:
            image_content = base64.b64encode(f.read()).decode("utf-8")

        # Google Vision API 호출
        url = f"https://vision.googleapis.com/v1/images:annotate?key={api_key}"
        request_body = {
            "requests": [
                {
                    "image": {"content": image_content},
                    "features": [{"type": "DOCUMENT_TEXT_DETECTION"}],
                    "imageContext": {"languageHints": ["ko", "en"]},
                }
            ]
        }

        response = requests.post(url, json=request_body, timeout=120)
        response.raise_for_status()
        result = response.json()

        annotation = result.get("responses", [{}])[0]

        # API 오류 확인
        if "error" in annotation:
            error_msg = annotation["error"].get("message", "Unknown error")
            raise RuntimeError(f"Vision API 오류: {error_msg}")

        full_text_annotation = annotation.get("fullTextAnnotation", {})
        pages = full_text_annotation.get("pages", [])

        if not pages:
            # 텍스트 없음 - 빈 hOCR 작성
            _write_empty_hocr(output_hocr)
            Path(output_text).write_text("", encoding="utf-8")
            return

        page = pages[0]
        width = page.get("width", 1)
        height = page.get("height", 1)

        # 텍스트 출력
        text = full_text_annotation.get("text", "")
        Path(output_text).write_text(text, encoding="utf-8")

        # hOCR 생성
        hocr = _generate_hocr(page, width, height)
        Path(output_hocr).write_text(hocr, encoding="utf-8")

    @staticmethod
    def generate_pdf(input_file, output_pdf, output_text, options):
        raise NotImplementedError("hOCR 모드를 사용합니다")


def _generate_hocr(page, width, height):
    """Google Vision API 응답을 hOCR 포맷으로 변환"""
    lines = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        "<!DOCTYPE html PUBLIC \"-//W3C//DTD XHTML 1.0 Transitional//EN\"",
        '  "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">',
        '<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="ko" lang="ko">',
        "<head>",
        "  <title>Google Vision OCR</title>",
        '  <meta http-equiv="Content-Type" content="text/html; charset=utf-8" />',
        "</head>",
        "<body>",
        f'  <div class="ocr_page" id="page_1" title="bbox 0 0 {width} {height}; ppageno 0">',
    ]

    word_id = 0
    block_id = 0
    par_id = 0
    line_id = 0

    for block in page.get("blocks", []):
        block_bbox = _get_bbox(block.get("boundingBox", {}))
        block_id += 1
        lines.append(
            f'    <div class="ocr_carea" id="block_{block_id}" title="bbox {block_bbox}">'
        )

        for paragraph in block.get("paragraphs", []):
            par_bbox = _get_bbox(paragraph.get("boundingBox", {}))
            par_id += 1
            lines.append(
                f'      <p class="ocr_par" id="par_{par_id}" title="bbox {par_bbox}">'
            )

            # 각 문단을 한 줄(line)로 처리
            line_id += 1
            lines.append(
                f'        <span class="ocr_line" id="line_{line_id}" title="bbox {par_bbox}">'
            )

            for word in paragraph.get("words", []):
                word_bbox = _get_bbox(word.get("boundingBox", {}))
                word_text = "".join(
                    symbol.get("text", "") for symbol in word.get("symbols", [])
                )

                if not word_text.strip():
                    continue

                # HTML 이스케이프
                word_text = (
                    word_text.replace("&", "&amp;")
                    .replace("<", "&lt;")
                    .replace(">", "&gt;")
                    .replace('"', "&quot;")
                )

                word_id += 1
                conf = _get_confidence(word)
                lines.append(
                    f'          <span class="ocrx_word" id="word_{word_id}" '
                    f'title="bbox {word_bbox}; x_wconf {conf}">{word_text}</span>'
                )

            lines.append("        </span>")
            lines.append("      </p>")
        lines.append("    </div>")

    lines.append("  </div>")
    lines.append("</body>")
    lines.append("</html>")

    return "\n".join(lines)


def _get_bbox(bounding_box):
    """Vision API boundingBox에서 bbox 문자열 추출"""
    vertices = bounding_box.get("vertices", [])
    if len(vertices) < 4:
        return "0 0 0 0"

    x1 = max(vertices[0].get("x", 0), 0)
    y1 = max(vertices[0].get("y", 0), 0)
    x2 = max(vertices[2].get("x", 0), 0)
    y2 = max(vertices[2].get("y", 0), 0)

    return f"{x1} {y1} {x2} {y2}"


def _get_confidence(word):
    """단어의 신뢰도 점수 (0-100) 반환"""
    symbols = word.get("symbols", [])
    if not symbols:
        return 90

    confidences = [s.get("confidence", 0.9) for s in symbols]
    avg = sum(confidences) / len(confidences)
    return int(avg * 100)


def _write_empty_hocr(output_path):
    """빈 hOCR 파일 작성"""
    hocr = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        "<!DOCTYPE html PUBLIC \"-//W3C//DTD XHTML 1.0 Transitional//EN\"\n"
        '  "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">\n'
        '<html xmlns="http://www.w3.org/1999/xhtml">\n'
        "<head><title>Empty</title></head>\n"
        '<body><div class="ocr_page" title="bbox 0 0 1 1"></div></body>\n'
        "</html>"
    )
    Path(output_path).write_text(hocr, encoding="utf-8")


@hookimpl
def get_ocr_engine():
    return GoogleVisionOcrEngine()
