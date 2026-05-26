import smtplib
from email.mime.text import MIMEText
import time

def send_email_alert(subject, body):
    return True
    msg = MIMEText(body, 'plain', 'utf-8')
    msg['Subject'] = subject
    msg['From'] = "delta-agent@fly.io"
    msg['To'] = "tal.derie.td@gmail.com"

    # אנחנו משתמשים בשרת ה-SMTP של Gmail
    # הערה: בשביל זה צריך "App Password" מהחשבון שלך
    try:
        with smtplib.SMTP_SSL('smtp.gmail.com', 465) as server:
            server.login("tal.derie.td@gmail.com", "מפתח_האפליקציה_שלך")
            server.sendmail(msg['From'], msg['To'], msg.as_string())
    except Exception as e:
        print(f"Error sending email: {e}")

def scan_and_operate():
    print("Delta Agent is scanning for leads...")
    # כאן הלוגיקה של הסריקה
    # כשנמצא ליד מוצלח:
    success_message = "היי טל, מצאתי ליד חדש ושלחתי לו את לינק ה-PayPal! 🚀"
    send_email_alert("Delta Agent Update", success_message)

if __name__ == "__main__":
    while True:
        scan_and_operate()
        time.sleep(3600)
