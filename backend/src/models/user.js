import { DataTypes } from "sequelize";
import sequelize from '../config/database.js';
import bcrypt from 'bcryptjs';

export default (sequelize) => {
    const User = sequelize.define('User', {
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true
        },
        name: {
            type: DataTypes.STRING,
            allowNull: false
        },
        tenant_id: {
            type: DataTypes.INTEGER,
            allowNull: true
        },
        branch_id: {
            type: DataTypes.INTEGER,
            allowNull: true
        },
        email: {
            type: DataTypes.STRING,
            allowNull: false,
            unique: true
        },
        password_hash: {
            type: DataTypes.STRING,
            allowNull: false
        },
        role: {
            type: DataTypes.ENUM(
                'SUPER_ADMIN',
                'ADMIN',
                'MANAGER',
                'SALESMAN',
                'KARIGAR_INCHARGE'
            ),
            allowNull: false,
            defaultValue: 'ADMIN'
        },
        is_active: {
            type: DataTypes.BOOLEAN,
            defaultValue: true
        }
    },
    {
        tableName: 'users',

        hooks: {
            beforeCreate: async (user) => {
                if (user.password_hash) {
                    user.password_hash = await bcrypt.hash(user.password_hash, 10);
                }
            },

            beforeUpdate: async (user) => {
                if (user.changed("password_hash")) {
                    user.password_hash = await bcrypt.hash(user.password_hash, 10);
                }
            }
        }
    }
    );

    // Instance Method
    User.prototype.validatePassword = function (plainPassword) {
        return bcrypt.compare(plainPassword, this.password_hash);
    };

    User.associate = (models) => {
        User.belongsTo(models.Tenant, { foreignKey: 'tenant_id' });
        User.belongsTo(models.Branch, { foreignKey: 'branch_id' });
        User.hasMany(models.AuditLog, { foreignKey: 'operator_id' });
    };

    return User;
};