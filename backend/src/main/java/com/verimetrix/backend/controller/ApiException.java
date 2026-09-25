package com.verimetrix.backend.controller;

import org.springframework.http.HttpStatus;

/** Thrown anywhere in a request; rendered as {@code {"message": ...}} with the given status. */
public class ApiException extends RuntimeException {
    private final HttpStatus status;

    public ApiException(HttpStatus status, String message) {
        super(message);
        this.status = status;
    }

    public HttpStatus status() { return status; }
}
