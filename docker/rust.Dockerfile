FROM rust:slim
WORKDIR /sandbox
COPY code.rs .
RUN rustc code.rs -o code
CMD ["./code"]
