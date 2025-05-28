import asyncio
import json
import os
import requests
import logging # logging 导入
import random # Added for random delays
import xml.etree.ElementTree as ET # Added for XML parsing
from pathlib import Path # Added for path manipulation
import re # Added for Markdown image path conversion
from fastapi import FastAPI, HTTPException, Request
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse, StreamingResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Dict, Any, AsyncGenerator

# --- Logging Configuration ---
logging.basicConfig(
    level=logging.INFO, # 设置日志级别为 INFO (INFO, WARNING, ERROR, CRITICAL 都会被记录)
    format='%(asctime)s - %(levelname)s - %(name)s - %(filename)s:%(lineno)d - %(message)s', # 日志格式，添加了 %(name)s
    datefmt='%Y-%m-%d %H:%M:%S' # 时间格式
)

# 获取当前模块的日志记录器实例
logger = logging.getLogger(__name__)

# --- Configuration ---
API_KEY = "sk-gkrwtnkajvqsbhgvgvwwkbrluhkjetntqnqzbzhkyfmsylfb" # 替换为您的 API密钥
LLM_MODEL_NAME = "THUDM/GLM-4-32B-0414" # 或您偏好的模型

# 定义产品类型和对应的XML文件
PRODUCT_XML_MAPPING = {
    "熨烫机": "crawl(熨烫机).xml",
    "电风扇": "crawl(电风扇).xml",
    "电暖器": "crawl(电暖器).xml"
}

# --- Helper function to determine which XML file to use ---
def get_xml_file_for_query(query: str) -> str:
    for product_type, xml_file in PRODUCT_XML_MAPPING.items():
        if product_type in query:
            return xml_file
    return "crawl(熨烫机).xml"  # 默认返回熨烫机的XML文件

# --- Pydantic Models ---
class UserQueryRequest(BaseModel):
    message: str

class ParsedProductInfo(BaseModel):
    product_name: str
    platform: str
    num_screens: str
    style: str
    selling_points: List[str]

class ChatMessage(BaseModel):
    role: str
    content: str

class ChatRequest(BaseModel):
    messages: List[ChatMessage]

# --- FastAPI App Initialization ---
app = FastAPI()

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allows all origins
    allow_credentials=True,
    allow_methods=["*"],  # Allows all methods
    allow_headers=["*"],  # Allows all headers
)

if not os.path.exists("static"):
    logger.info("Creating static directory.") # 使用 logger
    os.makedirs("static")
if not os.path.exists("static/images"):
    logger.info("Creating static/images directory.") # 使用 logger
    os.makedirs("static/images")

app.mount("/static", StaticFiles(directory="static"), name="static")

# --- Helper function for image path conversion ---
def convert_abs_to_web_path(abs_img_path_str: str, app_root_path: Path) -> str | None:
    try:
        abs_img_path = Path(abs_img_path_str)
        static_base_abs = app_root_path / "static"

        # Try to make path relative using Path.relative_to (Python 3.9+)
        try:
            if abs_img_path.is_relative_to(static_base_abs): # Requires Python 3.9+
                relative_to_static_folder = abs_img_path.relative_to(static_base_abs)
                return f"/static/{relative_to_static_folder.as_posix()}"
        except AttributeError: # Fallback for Python < 3.9 or other issues with is_relative_to
            pass # Proceed to string manipulation fallback

        # Fallback: String manipulation (less robust but more compatible)
        # Normalize paths for comparison (lower case, posix separators)
        # Convert app_root_path to string, add 'static', and ensure trailing slash for prefix matching
        # Example: app_root_path = E:/PythonProject/rag/rag -> static_prefix_lower = e:/pythonproject/rag/rag/static/
        static_prefix_lower = (static_base_abs.as_posix() + "/").lower()
        img_path_posix_lower = abs_img_path.as_posix().lower()

        if img_path_posix_lower.startswith(static_prefix_lower):
            # Extract the part of the image path that comes after "..../static/"
            relative_part = abs_img_path.as_posix()[len(static_prefix_lower) -1:] # Keep leading slash for relative part
            # Ensure the relative part does not start with an extra slash if static_prefix_lower already had one
            # Correct construction: /static/ + relative_part_of_image_path
            # Example: /static/ + images/熨烫机/1.png
            # The length of static_base_abs.as_posix() is what we need to slice from original abs_img_path.as_posix()
            # Example: static_base_abs.as_posix() = "E:/PythonProject/rag/rag/static"
            # abs_img_path.as_posix() = "E:/PythonProject/rag/rag/static/images/熨烫机/1.png"
            # We need "images/熨烫机/1.png"
            if img_path_posix_lower.startswith(static_base_abs.as_posix().lower()): # Check without trailing slash for base
                 # Get the original casing part of the path after the static_base_abs
                 original_relative_part = abs_img_path.as_posix()[len(static_base_abs.as_posix()):]
                 return f"/static{original_relative_part if original_relative_part.startswith('/') else '/' + original_relative_part}"

        logger.warning(f"Image path '{abs_img_path_str}' could not be converted to a web path relative to static dir '{static_base_abs}'. Tried prefix: '{static_prefix_lower}'.")
        return None
    except Exception as e:
        logger.error(f"Error converting image path '{abs_img_path_str}': {e}", exc_info=True)
        return None

# --- New Helper function to convert Markdown image paths in text ---
def convert_markdown_image_paths(text_content: str, app_root: Path, logger_instance) -> str:
    # --- Temporarily disabled for debugging --- Start
    return text_content # Simply return original text, effectively disabling MD image conversion
    # --- Temporarily disabled for debugging --- End
    
    # --- Original code below, commented out ---\n    # if not text_content:\n    #     return \"\"\n    # \n    # markdown_image_regex = r\'!\\[(.*?)\\]\\((.*?)\\)\'\n    # \n    # def replacer(match):\n    #     alt_text = match.group(1)\n    #     original_path = match.group(2)\n    #     \n    #     is_potentially_local_or_absolute_path = not (\n    #         original_path.startswith(\'http://\') or \\\n    #         original_path.startswith(\'https://\') or \\\n    #         original_path.startswith(\'data:\') or \\\n    #         original_path.startswith(\'/static/\')\n    #     )\n    #     \n    #     looks_like_file_path = (\n    #         (\":\" in original_path and \"\\\\\" in original_path) or \\\n    #         (original_path.startswith(\"/\") and not original_path.startswith(\"/static\")) or \\\n    #         (\"/\" in original_path and \n    #          not original_path.startswith(\'http://\') and \\\n    #          not original_path.startswith(\'https://\') and \\\n    #          not original_path.startswith(\'data:\')\n    #         )\n    #     )\n    # \n    #     if is_potentially_local_or_absolute_path and looks_like_file_path:\n    #         logger_instance.info(f\"Found potential local Markdown image path: {original_path}\")\n    #         web_path = convert_abs_to_web_path(original_path, app_root)\n    #         if web_path:\n    #             logger_instance.info(f\"Converted Markdown image path \'{original_path}\' to \'{web_path}\'\")\n    #             return f\'![{alt_text}]({web_path})\'\n    #         else:\n    #             logger_instance.warning(f\"Failed to convert Markdown image path: {original_path}. Will be left as is.\")\n    #             return match.group(0) \n    #     return match.group(0) \n    # \n    # try:\n    #     return re.sub(markdown_image_regex, replacer, text_content)\n    # except Exception as e:\n    #     logger_instance.error(f\"Error during Markdown image path conversion: {e}\", exc_info=True)\n    #     return text_content 

# --- API Endpoints ---
@app.get("/", response_class=HTMLResponse)
async def get_index_page():
    try:
        with open("static/index.html", "r", encoding="utf-8") as f:
            return HTMLResponse(content=f.read())
    except FileNotFoundError:
        logger.error("index.html not found in static directory.", exc_info=True) # 使用 logger
        raise HTTPException(status_code=404, detail="index.html not found. Make sure it's in the 'static' directory.")

# 新的流式聊天 API 端点
LLM_API_URL = "https://api.siliconflow.cn/v1/chat/completions"

# This is the new comprehensive streaming generator
async def comprehensive_stream_generator(chat_request: ChatRequest) -> AsyncGenerator[str, None]:
    logger.info("--- Entered comprehensive_stream_generator ---")
    app_root = Path(os.getcwd())
    
    # 根据用户输入选择对应的XML文件
    last_message = chat_request.messages[-1].content if chat_request.messages else ""
    crawl_file_name = get_xml_file_for_query(last_message)
    crawl_file_path = app_root / crawl_file_name
    
    logger.info(f"Selected XML file: {crawl_file_name} based on query: {last_message}")
    
    references = []
    think_text = ""
    answer_elements_data = [] # To store structured text and image info

    # 1. Parse crawl.xml
    if crawl_file_path.exists():
        try:
            tree = ET.parse(crawl_file_path)
            root = tree.getroot()

            for item_tag in root.findall(".//reference/item"):
                if item_tag.text:
                    references.append(item_tag.text.strip())
            
            think_node = root.find("think")
            if think_node is not None and think_node.text:
                raw_think_text = "\n".join([line.strip() for line in think_node.text.strip().splitlines() if line.strip()])
                logger.info(f"Raw think text before conversion: '{raw_think_text[:100]}...' (length: {len(raw_think_text)})")
                think_text = convert_markdown_image_paths(raw_think_text, app_root, logger) # Process think text too
                logger.info(f"Think text after conversion: '{think_text[:100]}...' (length: {len(think_text)})")
            else:
                logger.info("Think node is None or has no text content.")
                think_text = "" # Ensure think_text is defined, even if empty

            answer_node = root.find("answer")
            if answer_node is not None:
                if answer_node.text and answer_node.text.strip():
                    raw_text = "\n".join([line.strip() for line in answer_node.text.strip().splitlines() if line.strip()])
                    processed_text = convert_markdown_image_paths(raw_text, app_root, logger) # This will now just return raw_text due to changes above
                    answer_elements_data.append({"type": "text", "content": processed_text})
                for element in answer_node:
                    # --- Temporarily disable processing of <img> tags from XML --- Start
                    if element.tag == "img":
                        logger.info(f"Skipping XML <img> tag due to temporary disabling: {ET.tostring(element, encoding='unicode')[:100]}...")
                        # Optionally, if there's tail text for this img, process it as text
                        if element.tail and element.tail.strip():
                            raw_tail_text = "\n".join([line.strip() for line in element.tail.strip().splitlines() if line.strip()])
                            processed_tail_text = convert_markdown_image_paths(raw_tail_text, app_root, logger)
                            answer_elements_data.append({"type": "text", "content": processed_tail_text})
                        continue # Skip to the next element
                    # --- Temporarily disable processing of <img> tags from XML --- End
                    
                    # Original <img> tag processing - now effectively skipped by the block above
                    # if element.tag == "img":
                    #     img_path_text = element.text.strip() if element.text else ""
                    #     if img_path_text:
                    #         web_path = convert_abs_to_web_path(img_path_text, app_root)
                    #         if web_path:
                    #             answer_elements_data.append({"type": "image", "src": web_path})
                    #         else:
                    #             logger.warning(f"Could not convert XML <img> path to web URL: {img_path_text}. Image will be skipped.")
                    
                    # Process other potential child elements text if needed (e.g., <p>)
                    # For now, we are only directly processing text of <answer> and tail of its direct children.
                    # If <answer> contains <p>TEXT</p><img>TAIL_OF_IMG</p><p>MORE_TEXT</p>,
                    # the TEXT of the first <p> would need specific handling if it was not part of answer_node.text
                    # This example focuses on disabling <img> and their direct paths.

                    if element.tail and element.tail.strip():
                        raw_tail_text = "\n".join([line.strip() for line in element.tail.strip().splitlines() if line.strip()])
                        processed_tail_text = convert_markdown_image_paths(raw_tail_text, app_root, logger) # Will also return raw_tail_text
                        answer_elements_data.append({"type": "text", "content": processed_tail_text})
        except ET.ParseError as e:
            logger.error(f"Error parsing {crawl_file_name}: {e}", exc_info=True)
            yield f"data: {json.dumps({'type': 'error', 'source': 'xml_parse', 'message': f'Error parsing {crawl_file_name}', 'details': str(e)})}\n\n"
        except Exception as e:
            logger.error(f"Unexpected error processing {crawl_file_name}: {e}", exc_info=True)
            yield f"data: {json.dumps({'type': 'error', 'source': 'xml_process', 'message': f'Unexpected error processing {crawl_file_name}', 'details': str(e)})}\n\n"
    else:
        logger.warning(f"{crawl_file_name} not found.")
        yield f"data: {json.dumps({'type': 'warning', 'message': f'{crawl_file_name} not found, skipping crawl content.'})}\n\n"

    # 2. 10-second delay with reference animation
    total_animation_duration = 10.0
    yield f"data: {json.dumps({'type': 'crawling_animation', 'status': 'InProgress', 'message': 'Initiating crawl simulation...'})}\n\n"
    if references:
        logger.info(f"Starting {total_animation_duration}s crawl animation with {len(references)} references...")
        time_slots = [random.random() for _ in range(len(references))]
        total_random_sum = sum(time_slots)
        
        if total_random_sum == 0: # Handle edge case where all randoms are 0
            actual_durations = [total_animation_duration / len(references)] * len(references) if references else []
        else:
            actual_durations = [(t / total_random_sum) * total_animation_duration for t in time_slots]

        start_time = asyncio.get_event_loop().time()
        for i, ref_text in enumerate(references):
            current_loop_time = asyncio.get_event_loop().time()
            elapsed_time = current_loop_time - start_time
            remaining_total_time = total_animation_duration - elapsed_time

            if remaining_total_time <= 0: break

            duration_for_this_ref = actual_durations[i]
            sleep_duration = min(duration_for_this_ref, remaining_total_time)
            
            if sleep_duration <= 0.001 and i < len(references) -1: continue # Skip if slot is too small & not the last

            logger.debug(f"Displaying reference: {ref_text[:70]}... for {sleep_duration:.2f}s")
            yield f"data: {json.dumps({'type': 'crawling_animation', 'status': 'InProgress', 'current_reference': ref_text})}\n\n"
            if sleep_duration > 0: await asyncio.sleep(sleep_duration)
        
        final_elapsed = asyncio.get_event_loop().time() - start_time
        if final_elapsed < total_animation_duration:
            await asyncio.sleep(total_animation_duration - final_elapsed)
    else:
        logger.info(f"No references found in {crawl_file_name}, waiting for {total_animation_duration}s...")
        await asyncio.sleep(total_animation_duration)
    
    yield f"data: {json.dumps({'type': 'crawling_animation', 'status': 'Completed', 'message': 'Crawl simulation finished.'})}\n\n"
    logger.info("Crawl animation finished.")

    # 3. Stream <think> content
    if think_text:
        logger.info("Streaming <think> content... (Content is present)")
        yield f"data: {json.dumps({'type': 'think_start'})}\n\n"
        
        current_idx = 0
        text_len = len(think_text)
        while current_idx < text_len:
            chunk_size = random.randint(1, 3) # Chunks of 1, 2, or 3 characters
            actual_chunk_size = min(chunk_size, text_len - current_idx)
            chunk = think_text[current_idx : current_idx + actual_chunk_size]
            current_idx += actual_chunk_size

            yield f"data: {json.dumps({'type': 'think_chunk', 'content': chunk})}\n\n"

            ends_with_significant_pause = False
            if chunk.endswith('\n'):
                ends_with_significant_pause = True
            elif chunk.endswith('.'):
                if current_idx < text_len and think_text[current_idx] == ' ': # Period followed by space
                    ends_with_significant_pause = True
                elif current_idx == text_len: # Period at the very end of the text
                    ends_with_significant_pause = True
            
            if ends_with_significant_pause:
                await asyncio.sleep(random.uniform(0.2, 0.4)) # Slower for sentence/line ends
            else:
                await asyncio.sleep(random.uniform(0.05, 0.10)) # Slightly slower general chunk delay

        yield f"data: {json.dumps({'type': 'think_end'})}\n\n"
        logger.info("<think> content streamed.")
    else:
        logger.info("Skipping <think> content streaming because think_text is empty.")

    # 4. Stream <answer> content
    if answer_elements_data:
        logger.info("Streaming <answer> content...")
        yield f"data: {json.dumps({'type': 'answer_start'})}\n\n"
        for item in answer_elements_data:
            if item["type"] == "text":
                current_idx = 0
                answer_text_content = item["content"]
                text_len = len(answer_text_content)
                while current_idx < text_len:
                    chunk_size = random.randint(1, 3) # Chunks of 1, 2, or 3 characters
                    actual_chunk_size = min(chunk_size, text_len - current_idx)
                    chunk = answer_text_content[current_idx : current_idx + actual_chunk_size]
                    current_idx += actual_chunk_size

                    yield f"data: {json.dumps({'type': 'answer_chunk', 'content_type': 'text', 'content': chunk})}\n\n"

                    ends_with_significant_pause = False
                    if chunk.endswith('\n'):
                        ends_with_significant_pause = True
                    elif chunk.endswith('.'):
                        if current_idx < text_len and answer_text_content[current_idx] == ' ': # Period followed by space
                            ends_with_significant_pause = True
                        elif current_idx == text_len: # Period at the very end of the text
                            ends_with_significant_pause = True

                    if ends_with_significant_pause:
                        await asyncio.sleep(random.uniform(0.2, 0.4)) # Slower for sentence/line ends
                    else:
                        await asyncio.sleep(random.uniform(0.05, 0.10)) # Slightly slower general chunk delay
            elif item["type"] == "image": # This case should not be hit now
                logger.info(f"Attempting to stream an image (should be disabled): {item.get('src')}") # Log if this happens
                # --- Temporarily disable sending image data to frontend --- Start
                # img_tag_html = f'<img src="{item["src"]}" alt="Image from crawl.xml" style="max-width:90%; height:auto; margin:10px 0; border:1px solid #ddd; padding:5px;">'
                # yield f"data: {json.dumps({'type': 'answer_chunk', 'content_type': 'image', 'html': img_tag_html})}\\n\\n"
                # await asyncio.sleep(0.2) 
                # --- Temporarily disable sending image data to frontend --- End
                pass # Do nothing for image types for now
        yield f"data: {json.dumps({'type': 'answer_end'})}\n\n"
        logger.info("<answer> content streamed.")

    # 5. Stream actual LLM response
    logger.info("--- Proceeding to LLM API call for AI response ---")
    payload = {
        "model": LLM_MODEL_NAME,
        "messages": [msg.dict() for msg in chat_request.messages],
        "stream": True,
        "max_tokens": 8192, "temperature": 0.7, "top_p": 0.7,
    }
    logger.info(f"Payload to SiliconFlow: {json.dumps(payload, indent=2)}")
    headers = {"Authorization": f"Bearer {API_KEY}", "Content-Type": "application/json", "Accept": "text/event-stream"}

    try:
        with requests.post(LLM_API_URL, json=payload, headers=headers, stream=True, timeout=180) as response:
            response.raise_for_status()
            for line in response.iter_lines():
                if line:
                    decoded_line = line.decode('utf-8')
                    if decoded_line.startswith("data: "):
                        json_str = decoded_line[len("data: "):]
                        if json_str.strip() == "[DONE]":
                            break
                        try:
                            data = json.loads(json_str)
                            if data.get("choices"):
                                chunk = data["choices"][0].get("delta", {})
                                if chunk.get("content"):
                                    yield f"data: {json.dumps({'type': 'ai_response', 'content': chunk['content']})}\n\n"
                        except json.JSONDecodeError:
                            continue
    except requests.exceptions.RequestException as e:
        yield f"data: {json.dumps({'type': 'error', 'message': f'LLM API 请求失败: {str(e)}'})}\n\n"

@app.post("/api/chat")
async def api_chat_endpoint(chat_request: ChatRequest):
    logger.info("--- Received request at /api/chat endpoint (comprehensive streaming) ---") # 使用 logger
    return StreamingResponse(comprehensive_stream_generator(chat_request), media_type="text/event-stream")


if __name__ == "__main__":
    import uvicorn
    logger.info("Starting application using 'python main.py'...")
    logger.info("To run with Uvicorn CLI (these specific startup logs won't show): uvicorn main:app --reload")
    logger.info("Ensure static files (index.html, style.css, script.js, images/) are in a 'static' subdirectory.")
    logger.info(f"Access the application at http://127.0.0.1:8001 (when run with 'python {os.path.basename(__file__)}')")
    uvicorn.run(app, port=8001) # 可以考虑传递 log_config=None 或自定义的日志配置字典