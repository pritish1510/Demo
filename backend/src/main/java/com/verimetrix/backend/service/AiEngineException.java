package com.verimetrix.backend.service;

/** The AI engine could not be reached or returned something unusable. */
public class AiEngineException extends RuntimeException {
    public AiEngineException(String message) { super(message); }
    public AiEngineException(String message, Throwable cause) { super(message, cause); }
}
