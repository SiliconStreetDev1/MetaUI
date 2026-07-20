const CONTRACTOR_SCHEMA = {
    type: "object",
    properties: {
        CompanyName: { type: "string", title: "Company Name" },
        HourlyRate: { type: "number", title: "Hourly Rate" }
    }
};

const STANDARD_SCHEMA = {
    type: "object",
    properties: {
        CustomerName: { type: "string", title: "Customer Name" },
        OrderTotal: { type: "number", title: "Total Amount" }
    }
};

module.exports = {
    update: async function (request, entity, db) {
        // Intercept PATCH/PUT updates
        if (request.method === "PATCH" || request.method === "PUT") {
            // Check if DocumentType was changed
            const newDocType = request.body.DocumentType;
            if (newDocType) {
                if (newDocType === "Contractor") {
                    entity.ConfigPayload = JSON.stringify(CONTRACTOR_SCHEMA);
                } else {
                    entity.ConfigPayload = JSON.stringify(STANDARD_SCHEMA);
                }
            }
        }
        return false; // return false to let default processing continue and save the entity
    }
};
