FROM python:3.11-slim
WORKDIR /sandbox
COPY code.py .
CMD ["python", "code.py"]
