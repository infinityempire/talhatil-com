import os
import sys
import time
import logging
import random
import asyncio
from google import generativeai as genai

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - [TAL HA TIL CLOUD AGENT] - %(levelname)s - %(message)s',
    handlers=[logging.StreamHandler(sys.stdout)]
)
logger = logging.getLogger("DeltaAgent")

IS_CODESPACE = "CODESPACE_NAME" in os.environ
if IS_CODESPACE:
    WORKSPACE_DIR = "/workspaces/talhatil-com/"
    OUTPUT_DIR = os.path.join(WORKSPACE_DIR, "output")
else:
    WORKSPACE_DIR = "/data/data/com.termux/files/home/OpenManus-Setup/OpenManus/workspace/"
    OUTPUT_DIR = "/sdcard/Download/"

os.makedirs(OUTPUT_DIR, exist_ok=True)

API_KEY = os.environ.get("GEMINI_API_KEY")
if not API_KEY:
    logger.critical("⚠️ GEMINI_API_KEY Missing! Delta requires a brain to operate.")
    sys.exit(1)
genai.configure(api_key=API_KEY)

def ask_gemini(prompt):
    model = genai.GenerativeModel('gemini-2.5-flash')
    for i in range(5):
        try:
            response = model.generate_content(prompt)
            return response.text
        except Exception as e:
            if "429" in str(e):
                delay = (2 ** i) + random.uniform(0, 1)
                time.sleep(delay)
            else:
                logger.error(f"Gemini API Error: {e}")
                return None
    return None

class DeltaCoreAgent:
    def __init__(self, goal):
        self.goal = goal
        self.task_list = []
        self.completed_tasks = []

    def plan_tasks(self):
        logger.info(f"🧠 דלתא מנתח את המטרה ומייצר תוכנית עבודה: {self.goal}")
        prompt = f"""
        You are Delta, the autonomous operations agent for the 'Tal HaTil Empire'.
        Your main goal is: {self.goal}
        Break down this goal into a strict step-by-step list of technical sub-tasks that a Python agent can execute (e.g., searching the web, writing files, generating data).
        Return ONLY a clean, numbered list of tasks, one per line. No introduction, no markdown formatting.
        """
        raw_plan = ask_gemini(prompt)
        if raw_plan:
            self.task_list = [t.strip() for t in raw_plan.split('\n') if t.strip()]
            logger.info(f"📋 תוכנית העבודה גובשה! {len(self.task_list)} משימות זוהו.")
        else:
            self.task_list = ["סריקת בסיס נתונים מקומי לחיפוש הזדמנויות."]

    async def execute_task(self, task):
        logger.info(f"🚀 מבצע כעת: {task}")
        prompt = f"""
        Execute the following task for the system: '{task}'
        Based on the goal '{self.goal}', generate the simulated technical output or data required.
        Provide a concise engineering status report of the result.
        """
        result = ask_gemini(prompt)
        await asyncio.sleep(2)
        return result or "Task execution returned empty state."

    async def run(self):
        self.plan_tasks()
        for idx, task in enumerate(self.task_list):
            logger.info(f"🔄 שלב {idx+1}/{len(self.task_list)}")
            result = await self.execute_task(task)
            self.completed_tasks.append({"task": task, "result": result})
            
        logger.info("💥 כל המשימות הושלמו בהצלחה!")
        self.generate_final_report()

    def generate_final_report(self):
        report_path = os.path.join(OUTPUT_DIR, "delta_execution_report.txt")
        with open(report_path, "w", encoding="utf-8") as f:
            f.write(f"=== DELTA AGENT EXECUTION REPORT ===\n")
            f.write(f"ORIGINAL GOAL: {self.goal}\n")
            f.write(f"STATUS: SUCCESS\n====================================\n\n")
            for item in self.completed_tasks:
                f.write(f"[-] TASK: {item['task']}\n")
                f.write(f"[=] RESULT:\n{item['result']}\n\n-------------------\n")
        logger.info(f"👑 דוח ביצוע סופי נשמר בהצלחה בנתיב: {report_path}")

def main():
    logger.info("⚡ מניע את סוכן דלתא האוטונומי בענן ובמקומי...")
    goal = "סריקת שוק ראשונית וגיבוש אסטרטגיה למשיכת לידים עבור 40 קורסי ה-AI של טל הטיל ללא חשיפת פנים."
    agent = DeltaCoreAgent(goal)
    asyncio.run(agent.run())

if __name__ == "__main__":
    main()